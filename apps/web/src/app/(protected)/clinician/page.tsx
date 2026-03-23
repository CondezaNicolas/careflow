import { USER_ROLE } from "@/features/auth/auth.types";
import { RoleLandingPage } from "@/features/auth/components/role-landing-page";

export default function ClinicianPage() {
  return (
    <RoleLandingPage
      description="This clinician landing page anchors the protected route and gives the auth flow a real destination without pretending the feature work is done."
      headline="Review visits, triage queues, and chart handoffs"
      highlights={[
        "Protected clinician navigation is wired",
        "Session expiry falls back to sign-in recovery",
        "The shared layout keeps auth controls consistent"
      ]}
      role={USER_ROLE.CLINICIAN}
    />
  );
}
