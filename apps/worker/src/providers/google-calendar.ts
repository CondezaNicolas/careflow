import { WORKER_PROVIDER_MODE, type WorkerEnv, type WorkerProviderMode } from "../env.js";
import { RetryableSyncError, type GoogleCalendarGateway } from "../worker.js";

const GOOGLE_CALENDAR_API = {
  BASE_URL: "https://www.googleapis.com/calendar/v3",
  TOKEN_URL: "https://oauth2.googleapis.com/token"
} as const;

const GOOGLE_CALENDAR_PROVIDER = {
  NOOP: "noop",
  CONFIGURED: "google_calendar_configured"
} as const;

type GoogleCalendarProvider =
  (typeof GOOGLE_CALENDAR_PROVIDER)[keyof typeof GOOGLE_CALENDAR_PROVIDER];

export interface GoogleCalendarProviderResolution {
  mode: WorkerProviderMode;
  provider: GoogleCalendarProvider;
  providerPath: string;
}

export interface ResolvedGoogleCalendarProvider {
  gateway: GoogleCalendarGateway;
  resolution: GoogleCalendarProviderResolution;
}

type GoogleCalendarProviderEnv = Pick<
  WorkerEnv,
  | "GOOGLE_CALENDAR_PROVIDER_MODE"
  | "GOOGLE_CALENDAR_CLIENT_ID"
  | "GOOGLE_CALENDAR_CLIENT_SECRET"
  | "GOOGLE_CALENDAR_REFRESH_TOKEN"
  | "GOOGLE_CALENDAR_CALENDAR_ID"
>;

interface GoogleCalendarProviderOptions {
  fetch?: typeof fetch;
}

interface GoogleCalendarAccessTokenResponse {
  access_token?: unknown;
}

interface GoogleCalendarEventResponse {
  id?: unknown;
}

export function createGoogleCalendarProvider(
  env: GoogleCalendarProviderEnv,
  options: GoogleCalendarProviderOptions = {}
): ResolvedGoogleCalendarProvider {
  if (env.GOOGLE_CALENDAR_PROVIDER_MODE === WORKER_PROVIDER_MODE.NOOP) {
    return {
      gateway: new NoopGoogleCalendarGateway(),
      resolution: {
        mode: WORKER_PROVIDER_MODE.NOOP,
        provider: GOOGLE_CALENDAR_PROVIDER.NOOP,
        providerPath: "google_calendar.noop"
      }
    };
  }

  assertGoogleCalendarConfig(env);

  return {
    gateway: new ConfiguredGoogleCalendarGateway({
      calendarId: env.GOOGLE_CALENDAR_CALENDAR_ID!,
      clientId: env.GOOGLE_CALENDAR_CLIENT_ID!,
      clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      refreshToken: env.GOOGLE_CALENDAR_REFRESH_TOKEN!,
      fetchImplementation: options.fetch ?? fetch
    }),
    resolution: {
      mode: WORKER_PROVIDER_MODE.PROVIDER,
      provider: GOOGLE_CALENDAR_PROVIDER.CONFIGURED,
      providerPath: "google_calendar.provider.configured"
    }
  };
}

class NoopGoogleCalendarGateway implements GoogleCalendarGateway {
  async upsertAppointmentEvent(input: {
    tenantId: string;
    appointmentId: string;
    externalCalendarEventId: string | null;
    startAtIso: string;
    endAtIso: string;
  }) {
    return {
      externalCalendarEventId:
        input.externalCalendarEventId ??
        `gcal_${input.tenantId.replaceAll(/[^a-zA-Z0-9]/g, "")}_${input.appointmentId}`
    };
  }

  async cancelAppointmentEvent(input: {
    tenantId: string;
    appointmentId: string;
    externalCalendarEventId: string | null;
    startAtIso: string;
    endAtIso: string;
  }) {
    if (!input.externalCalendarEventId) {
      return { externalCalendarEventId: null };
    }

    return { externalCalendarEventId: input.externalCalendarEventId };
  }
}

class ConfiguredGoogleCalendarGateway implements GoogleCalendarGateway {
  constructor(
    private readonly config: {
      calendarId: string;
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      fetchImplementation: typeof fetch;
    }
  ) {}

  async upsertAppointmentEvent(input: {
    tenantId: string;
    appointmentId: string;
    externalCalendarEventId: string | null;
    startAtIso: string;
    endAtIso: string;
  }): Promise<{ externalCalendarEventId: string | null }> {
    const accessToken = await this.exchangeRefreshToken();
    const eventPayload = {
      summary: `LIA appointment ${input.appointmentId}`,
      description: [`tenant:${input.tenantId}`, `appointment:${input.appointmentId}`].join("\n"),
      start: {
        dateTime: input.startAtIso
      },
      end: {
        dateTime: input.endAtIso
      },
      extendedProperties: {
        private: {
          tenantId: input.tenantId,
          appointmentId: input.appointmentId
        }
      }
    };

    if (input.externalCalendarEventId) {
      const eventId = await this.writeEvent(
        `${GOOGLE_CALENDAR_API.BASE_URL}/calendars/${encodeURIComponent(this.config.calendarId)}/events/${encodeURIComponent(input.externalCalendarEventId)}?sendUpdates=none`,
        "PATCH",
        accessToken,
        eventPayload,
        "update appointment event"
      );

      return {
        externalCalendarEventId: eventId
      };
    }

    const eventId = await this.writeEvent(
      `${GOOGLE_CALENDAR_API.BASE_URL}/calendars/${encodeURIComponent(this.config.calendarId)}/events?sendUpdates=none`,
      "POST",
      accessToken,
      eventPayload,
      "create appointment event"
    );

    return {
      externalCalendarEventId: eventId
    };
  }

  async cancelAppointmentEvent(input: {
    tenantId: string;
    appointmentId: string;
    externalCalendarEventId: string | null;
    startAtIso: string;
    endAtIso: string;
  }): Promise<{ externalCalendarEventId: string | null }> {
    if (!input.externalCalendarEventId) {
      return { externalCalendarEventId: null };
    }

    const accessToken = await this.exchangeRefreshToken();
    await this.request(
      `${GOOGLE_CALENDAR_API.BASE_URL}/calendars/${encodeURIComponent(this.config.calendarId)}/events/${encodeURIComponent(input.externalCalendarEventId)}?sendUpdates=none`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      },
      "delete appointment event"
    );

    return { externalCalendarEventId: null };
  }

  private async exchangeRefreshToken(): Promise<string> {
    const response = await this.request(
      GOOGLE_CALENDAR_API.TOKEN_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: "refresh_token"
        }).toString()
      },
      "exchange Google refresh token"
    );

    const payload = (await response.json()) as GoogleCalendarAccessTokenResponse;

    if (typeof payload.access_token !== "string" || payload.access_token.length === 0) {
      throw new Error("Google Calendar token exchange did not return an access token");
    }

    return payload.access_token;
  }

  private async writeEvent(
    url: string,
    method: "PATCH" | "POST",
    accessToken: string,
    payload: Record<string, unknown>,
    action: string
  ): Promise<string> {
    const response = await this.request(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      },
      action
    );

    const responseBody = (await response.json()) as GoogleCalendarEventResponse;

    if (typeof responseBody.id !== "string" || responseBody.id.length === 0) {
      throw new Error(`Google Calendar ${action} did not return an event id`);
    }

    return responseBody.id;
  }

  private async request(url: string, init: RequestInit, action: string): Promise<Response> {
    let response: Response;

    try {
      response = await this.config.fetchImplementation(url, init);
    } catch (error) {
      throw new RetryableSyncError(
        `Google Calendar ${action} failed before receiving a response: ${normalizeNetworkError(error)}`
      );
    }

    if (response.ok) {
      return response;
    }

    const body = await response.text();
    const message = buildHttpFailureMessage("Google Calendar", action, response.status, body);

    if (isRetryableHttpStatus(response.status)) {
      throw new RetryableSyncError(message);
    }

    throw new Error(message);
  }
}

function assertGoogleCalendarConfig(env: GoogleCalendarProviderEnv): void {
  const requiredKeys = [
    env.GOOGLE_CALENDAR_CLIENT_ID,
    env.GOOGLE_CALENDAR_CLIENT_SECRET,
    env.GOOGLE_CALENDAR_REFRESH_TOKEN,
    env.GOOGLE_CALENDAR_CALENDAR_ID
  ];

  if (requiredKeys.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error(
      "Google Calendar provider mode requires complete credential configuration before startup"
    );
  }
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
