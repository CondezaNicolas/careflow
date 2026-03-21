import { WORKER_PROVIDER_MODE, type WorkerEnv, type WorkerProviderMode } from "../env.js";
import { RetryableNotificationError, type NotificationChannelGateway } from "../worker.js";

const NOTIFICATION_API = {
  EMAIL_URL: "https://api.resend.com/emails",
  WHATSAPP_BASE_URL: "https://graph.facebook.com/v22.0"
} as const;

const NOTIFICATION_PROVIDER = {
  NOOP: "noop",
  CONFIGURED: "configured"
} as const;

type NotificationProvider = (typeof NOTIFICATION_PROVIDER)[keyof typeof NOTIFICATION_PROVIDER];

interface NotificationChannelResolution {
  mode: WorkerProviderMode;
  provider: NotificationProvider;
  providerPath: string;
}

export interface NotificationsProviderResolution {
  email: NotificationChannelResolution;
  whatsapp: NotificationChannelResolution;
}

export interface ResolvedNotificationsProvider {
  gateway: NotificationChannelGateway;
  resolution: NotificationsProviderResolution;
}

type NotificationsProviderEnv = Pick<
  WorkerEnv,
  | "EMAIL_PROVIDER_MODE"
  | "EMAIL_PROVIDER_API_KEY"
  | "EMAIL_PROVIDER_FROM"
  | "WHATSAPP_PROVIDER_MODE"
  | "WHATSAPP_ACCESS_TOKEN"
  | "WHATSAPP_PHONE_NUMBER_ID"
  | "WHATSAPP_BUSINESS_ACCOUNT_ID"
>;

interface NotificationsProviderOptions {
  fetch?: typeof fetch;
}

type EmailInput = Parameters<NotificationChannelGateway["sendEmail"]>[0];
type WhatsAppInput = Parameters<NotificationChannelGateway["sendWhatsApp"]>[0];

interface EmailGateway {
  send(input: EmailInput): ReturnType<NotificationChannelGateway["sendEmail"]>;
}

interface WhatsAppGateway {
  send(input: WhatsAppInput): ReturnType<NotificationChannelGateway["sendWhatsApp"]>;
}

export function createNotificationsProvider(
  env: NotificationsProviderEnv,
  options: NotificationsProviderOptions = {}
): ResolvedNotificationsProvider {
  const emailGateway = resolveEmailGateway(env);
  const whatsAppGateway = resolveWhatsAppGateway(env);
  const fetchImplementation = options.fetch ?? fetch;

  return {
    gateway: new CompositeNotificationGateway(
      emailGateway.gateway ??
        new ConfiguredEmailGateway({
          apiKey: env.EMAIL_PROVIDER_API_KEY!,
          from: env.EMAIL_PROVIDER_FROM!,
          fetchImplementation
        }),
      whatsAppGateway.gateway ??
        new ConfiguredWhatsAppGateway({
          accessToken: env.WHATSAPP_ACCESS_TOKEN!,
          phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID!,
          businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID!,
          fetchImplementation
        })
    ),
    resolution: {
      email: emailGateway.resolution,
      whatsapp: whatsAppGateway.resolution
    }
  };
}

class CompositeNotificationGateway implements NotificationChannelGateway {
  constructor(
    private readonly emailGateway: EmailGateway,
    private readonly whatsAppGateway: WhatsAppGateway
  ) {}

  sendEmail(input: EmailInput): ReturnType<NotificationChannelGateway["sendEmail"]> {
    return this.emailGateway.send(input);
  }

  sendWhatsApp(input: WhatsAppInput): ReturnType<NotificationChannelGateway["sendWhatsApp"]> {
    return this.whatsAppGateway.send(input);
  }
}

class NoopEmailGateway implements EmailGateway {
  async send(input: EmailInput) {
    return {
      providerMessageId: `email_${input.tenantId.replaceAll(/[^a-zA-Z0-9]/g, "")}_${input.patientId}`
    };
  }
}

class NoopWhatsAppGateway implements WhatsAppGateway {
  async send(input: WhatsAppInput) {
    return {
      providerMessageId: `wa_${input.tenantId.replaceAll(/[^a-zA-Z0-9]/g, "")}_${input.patientId}`
    };
  }
}

class ConfiguredEmailGateway implements EmailGateway {
  constructor(
    private readonly config: {
      apiKey: string;
      from: string;
      fetchImplementation: typeof fetch;
    }
  ) {}

  async send(input: EmailInput): ReturnType<NotificationChannelGateway["sendEmail"]> {
    const response = await requestNotificationApi(
      this.config.fetchImplementation,
      NOTIFICATION_API.EMAIL_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [input.toEmail],
          subject: input.subject,
          text: input.body,
          headers: {
            "X-LIA-Tenant-ID": input.tenantId,
            "X-LIA-Patient-ID": input.patientId
          }
        })
      },
      "Email",
      "send delivery"
    );

    const payload = (await response.json()) as { id?: unknown };

    if (typeof payload.id !== "string" || payload.id.length === 0) {
      throw new Error("Email send delivery did not return a provider message id");
    }

    return {
      providerMessageId: payload.id
    };
  }
}

class ConfiguredWhatsAppGateway implements WhatsAppGateway {
  constructor(
    private readonly config: {
      accessToken: string;
      phoneNumberId: string;
      businessAccountId: string;
      fetchImplementation: typeof fetch;
    }
  ) {}

  async send(input: WhatsAppInput): ReturnType<NotificationChannelGateway["sendWhatsApp"]> {
    const response = await requestNotificationApi(
      this.config.fetchImplementation,
      `${NOTIFICATION_API.WHATSAPP_BASE_URL}/${encodeURIComponent(this.config.phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: input.toPhone,
          type: "text",
          text: {
            body: input.body
          },
          biz_opaque_callback_data: `${this.config.businessAccountId}:${input.tenantId}:${input.patientId}`
        })
      },
      "WhatsApp",
      "send delivery"
    );

    const payload = (await response.json()) as {
      messages?: Array<{
        id?: unknown;
      }>;
    };
    const messageId = payload.messages?.[0]?.id;

    if (typeof messageId !== "string" || messageId.length === 0) {
      throw new Error("WhatsApp send delivery did not return a provider message id");
    }

    return {
      providerMessageId: messageId
    };
  }
}

function resolveEmailGateway(env: NotificationsProviderEnv): {
  gateway: EmailGateway | null;
  resolution: NotificationChannelResolution;
} {
  if (env.EMAIL_PROVIDER_MODE === WORKER_PROVIDER_MODE.NOOP) {
    return {
      gateway: new NoopEmailGateway(),
      resolution: {
        mode: WORKER_PROVIDER_MODE.NOOP,
        provider: NOTIFICATION_PROVIDER.NOOP,
        providerPath: "notifications.email.noop"
      }
    };
  }

  if (!env.EMAIL_PROVIDER_API_KEY || !env.EMAIL_PROVIDER_FROM) {
    throw new Error(
      "Email provider mode requires complete credential configuration before startup"
    );
  }

  return {
    gateway: null,
    resolution: {
      mode: WORKER_PROVIDER_MODE.PROVIDER,
      provider: NOTIFICATION_PROVIDER.CONFIGURED,
      providerPath: "notifications.email.provider.configured"
    }
  };
}

function resolveWhatsAppGateway(env: NotificationsProviderEnv): {
  gateway: WhatsAppGateway | null;
  resolution: NotificationChannelResolution;
} {
  if (env.WHATSAPP_PROVIDER_MODE === WORKER_PROVIDER_MODE.NOOP) {
    return {
      gateway: new NoopWhatsAppGateway(),
      resolution: {
        mode: WORKER_PROVIDER_MODE.NOOP,
        provider: NOTIFICATION_PROVIDER.NOOP,
        providerPath: "notifications.whatsapp.noop"
      }
    };
  }

  if (
    !env.WHATSAPP_ACCESS_TOKEN ||
    !env.WHATSAPP_PHONE_NUMBER_ID ||
    !env.WHATSAPP_BUSINESS_ACCOUNT_ID
  ) {
    throw new Error(
      "WhatsApp provider mode requires complete credential configuration before startup"
    );
  }

  return {
    gateway: null,
    resolution: {
      mode: WORKER_PROVIDER_MODE.PROVIDER,
      provider: NOTIFICATION_PROVIDER.CONFIGURED,
      providerPath: "notifications.whatsapp.provider.configured"
    }
  };
}

async function requestNotificationApi(
  fetchImplementation: typeof fetch,
  url: string,
  init: RequestInit,
  provider: string,
  action: string
): Promise<Response> {
  let response: Response;

  try {
    response = await fetchImplementation(url, init);
  } catch (error) {
    throw new RetryableNotificationError(
      `${provider} ${action} failed before receiving a response: ${normalizeNetworkError(error)}`
    );
  }

  if (response.ok) {
    return response;
  }

  const body = await response.text();
  const message = buildHttpFailureMessage(provider, action, response.status, body);

  if (isRetryableHttpStatus(response.status)) {
    throw new RetryableNotificationError(message);
  }

  throw new Error(message);
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function normalizeNetworkError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "unknown network failure";
}

function buildHttpFailureMessage(
  provider: string,
  action: string,
  status: number,
  body: string
): string {
  const details = body.trim().length > 0 ? `: ${body.trim()}` : "";
  return `${provider} ${action} failed with HTTP ${status}${details}`;
}
