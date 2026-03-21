import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RetryableSyncError } from "../worker.js";
import { createGoogleCalendarProvider } from "./google-calendar.js";

describe("google calendar provider resolution", () => {
  it("resolves explicit noop mode for non-production wiring", async () => {
    const provider = createGoogleCalendarProvider({
      GOOGLE_CALENDAR_PROVIDER_MODE: "noop",
      GOOGLE_CALENDAR_CLIENT_ID: undefined,
      GOOGLE_CALENDAR_CLIENT_SECRET: undefined,
      GOOGLE_CALENDAR_REFRESH_TOKEN: undefined,
      GOOGLE_CALENDAR_CALENDAR_ID: undefined
    });

    assert.deepEqual(provider.resolution, {
      mode: "noop",
      provider: "noop",
      providerPath: "google_calendar.noop"
    });

    const result = await provider.gateway.upsertAppointmentEvent({
      tenantId: "tenant-1",
      appointmentId: "apt-1",
      externalCalendarEventId: null,
      startAtIso: "2026-03-20T14:00:00.000Z",
      endAtIso: "2026-03-20T14:30:00.000Z"
    });

    assert.equal(result.externalCalendarEventId, "gcal_tenant1_apt-1");
  });

  it("executes the configured provider path through Google OAuth and event creation", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchStub: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });

      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "access-token" }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      if (url.includes("/calendar-id/events?sendUpdates=none")) {
        return new Response(JSON.stringify({ id: "gcal-event-123" }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    const provider = createGoogleCalendarProvider(
      {
        GOOGLE_CALENDAR_PROVIDER_MODE: "provider",
        GOOGLE_CALENDAR_CLIENT_ID: "client-id",
        GOOGLE_CALENDAR_CLIENT_SECRET: "client-secret",
        GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh-token",
        GOOGLE_CALENDAR_CALENDAR_ID: "calendar-id"
      },
      {
        fetch: fetchStub
      }
    );

    const result = await provider.gateway.upsertAppointmentEvent({
      tenantId: "tenant-1",
      appointmentId: "apt-1",
      externalCalendarEventId: null,
      startAtIso: "2026-03-20T14:00:00.000Z",
      endAtIso: "2026-03-20T14:30:00.000Z"
    });

    assert.equal(result.externalCalendarEventId, "gcal-event-123");
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, "https://oauth2.googleapis.com/token");
    assert.equal(requests[0]?.init?.method, "POST");
    assert.match(String(requests[0]?.init?.body), /grant_type=refresh_token/);
    assert.equal(
      requests[1]?.url,
      "https://www.googleapis.com/calendar/v3/calendars/calendar-id/events?sendUpdates=none"
    );
    assert.equal(requests[1]?.init?.method, "POST");
    assert.equal(requests[1]?.init?.headers instanceof Headers, false);
    assert.equal(
      (requests[1]?.init?.headers as Record<string, string>).Authorization,
      "Bearer access-token"
    );

    const body = JSON.parse(String(requests[1]?.init?.body)) as {
      summary: string;
      description: string;
      start: { dateTime: string };
      end: { dateTime: string };
      extendedProperties: { private: { tenantId: string; appointmentId: string } };
    };

    assert.deepEqual(body, {
      summary: "LIA appointment apt-1",
      description: "tenant:tenant-1\nappointment:apt-1",
      start: {
        dateTime: "2026-03-20T14:00:00.000Z"
      },
      end: {
        dateTime: "2026-03-20T14:30:00.000Z"
      },
      extendedProperties: {
        private: {
          tenantId: "tenant-1",
          appointmentId: "apt-1"
        }
      }
    });
  });

  it("retries transient configured provider failures instead of pretending readiness", async () => {
    const provider = createGoogleCalendarProvider(
      {
        GOOGLE_CALENDAR_PROVIDER_MODE: "provider",
        GOOGLE_CALENDAR_CLIENT_ID: "client-id",
        GOOGLE_CALENDAR_CLIENT_SECRET: "client-secret",
        GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh-token",
        GOOGLE_CALENDAR_CALENDAR_ID: "calendar-id"
      },
      {
        fetch: async (input) => {
          const url = String(input);
          if (url === "https://oauth2.googleapis.com/token") {
            return new Response(JSON.stringify({ access_token: "access-token" }), {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            });
          }

          return new Response(JSON.stringify({ error: "temporarily unavailable" }), {
            status: 503,
            headers: {
              "content-type": "application/json"
            }
          });
        }
      }
    );

    await assert.rejects(
      () =>
        provider.gateway.upsertAppointmentEvent({
          tenantId: "tenant-1",
          appointmentId: "apt-1",
          externalCalendarEventId: null,
          startAtIso: "2026-03-20T14:00:00.000Z",
          endAtIso: "2026-03-20T14:30:00.000Z"
        }),
      (error: unknown) => {
        assert.ok(error instanceof RetryableSyncError);
        assert.match(error.message, /HTTP 503/);
        return true;
      }
    );
  });
});
