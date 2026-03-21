import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RetryableNotificationError } from "../worker.js";
import { createNotificationsProvider } from "./notifications.js";

describe("notification provider resolution", () => {
  it("resolves explicit noop mode per channel", async () => {
    const provider = createNotificationsProvider({
      EMAIL_PROVIDER_MODE: "noop",
      EMAIL_PROVIDER_API_KEY: undefined,
      EMAIL_PROVIDER_FROM: undefined,
      WHATSAPP_PROVIDER_MODE: "noop",
      WHATSAPP_ACCESS_TOKEN: undefined,
      WHATSAPP_PHONE_NUMBER_ID: undefined,
      WHATSAPP_BUSINESS_ACCOUNT_ID: undefined
    });

    assert.deepEqual(provider.resolution, {
      email: {
        mode: "noop",
        provider: "noop",
        providerPath: "notifications.email.noop"
      },
      whatsapp: {
        mode: "noop",
        provider: "noop",
        providerPath: "notifications.whatsapp.noop"
      }
    });

    const emailResult = await provider.gateway.sendEmail({
      tenantId: "tenant-1",
      patientId: "patient-1",
      subject: "subject",
      body: "body",
      toEmail: "patient@example.com"
    });
    const whatsappResult = await provider.gateway.sendWhatsApp({
      tenantId: "tenant-1",
      patientId: "patient-1",
      body: "body",
      toPhone: "+5491111111111"
    });

    assert.equal(emailResult.providerMessageId, "email_tenant1_patient-1");
    assert.equal(whatsappResult.providerMessageId, "wa_tenant1_patient-1");
  });

  it("executes configured email and WhatsApp providers through outbound HTTP adapters", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchStub: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });

      if (url === "https://api.resend.com/emails") {
        return new Response(JSON.stringify({ id: "email-msg-123" }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      if (url === "https://graph.facebook.com/v22.0/phone-number-id/messages") {
        return new Response(JSON.stringify({ messages: [{ id: "wa-msg-456" }] }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    const provider = createNotificationsProvider(
      {
        EMAIL_PROVIDER_MODE: "provider",
        EMAIL_PROVIDER_API_KEY: "email-api-key",
        EMAIL_PROVIDER_FROM: "ops@example.com",
        WHATSAPP_PROVIDER_MODE: "provider",
        WHATSAPP_ACCESS_TOKEN: "wa-token",
        WHATSAPP_PHONE_NUMBER_ID: "phone-number-id",
        WHATSAPP_BUSINESS_ACCOUNT_ID: "business-account-id"
      },
      {
        fetch: fetchStub
      }
    );

    const emailResult = await provider.gateway.sendEmail({
      tenantId: "tenant-1",
      patientId: "patient-1",
      subject: "subject",
      body: "body",
      toEmail: "patient@example.com"
    });
    const whatsappResult = await provider.gateway.sendWhatsApp({
      tenantId: "tenant-1",
      patientId: "patient-1",
      body: "body",
      toPhone: "+5491111111111"
    });

    assert.equal(emailResult.providerMessageId, "email-msg-123");
    assert.equal(whatsappResult.providerMessageId, "wa-msg-456");
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, "https://api.resend.com/emails");
    assert.equal(requests[1]?.url, "https://graph.facebook.com/v22.0/phone-number-id/messages");

    const emailHeaders = requests[0]?.init?.headers as Record<string, string>;
    assert.equal(emailHeaders.Authorization, "Bearer email-api-key");
    const emailBody = JSON.parse(String(requests[0]?.init?.body)) as {
      from: string;
      to: string[];
      subject: string;
      text: string;
      headers: Record<string, string>;
    };
    assert.deepEqual(emailBody, {
      from: "ops@example.com",
      to: ["patient@example.com"],
      subject: "subject",
      text: "body",
      headers: {
        "X-LIA-Tenant-ID": "tenant-1",
        "X-LIA-Patient-ID": "patient-1"
      }
    });

    const whatsAppHeaders = requests[1]?.init?.headers as Record<string, string>;
    assert.equal(whatsAppHeaders.Authorization, "Bearer wa-token");
    const whatsAppBody = JSON.parse(String(requests[1]?.init?.body)) as {
      messaging_product: string;
      recipient_type: string;
      to: string;
      type: string;
      text: { body: string };
      biz_opaque_callback_data: string;
    };
    assert.deepEqual(whatsAppBody, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "+5491111111111",
      type: "text",
      text: {
        body: "body"
      },
      biz_opaque_callback_data: "business-account-id:tenant-1:patient-1"
    });
  });

  it("marks transient configured delivery failures as retryable", async () => {
    const provider = createNotificationsProvider(
      {
        EMAIL_PROVIDER_MODE: "provider",
        EMAIL_PROVIDER_API_KEY: "email-api-key",
        EMAIL_PROVIDER_FROM: "ops@example.com",
        WHATSAPP_PROVIDER_MODE: "noop",
        WHATSAPP_ACCESS_TOKEN: undefined,
        WHATSAPP_PHONE_NUMBER_ID: undefined,
        WHATSAPP_BUSINESS_ACCOUNT_ID: undefined
      },
      {
        fetch: async () =>
          new Response(JSON.stringify({ error: "rate limited" }), {
            status: 429,
            headers: {
              "content-type": "application/json"
            }
          })
      }
    );

    await assert.rejects(
      () =>
        provider.gateway.sendEmail({
          tenantId: "tenant-1",
          patientId: "patient-1",
          subject: "subject",
          body: "body",
          toEmail: "patient@example.com"
        }),
      (error: unknown) => {
        assert.ok(error instanceof RetryableNotificationError);
        assert.match(error.message, /HTTP 429/);
        return true;
      }
    );
  });
});
