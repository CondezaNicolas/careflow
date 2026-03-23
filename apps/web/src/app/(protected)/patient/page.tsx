import { USER_ROLE } from "@/features/auth/auth.types";
import { RoleLandingPage } from "@/features/auth/components/role-landing-page";

export default function PatientPage() {
  return (
    <RoleLandingPage
      description="The patient landing page is intentionally lean, but it already proves protected navigation, logout, and session recovery for the self-service role."
      headline="Check appointments, messages, and next steps"
      highlights={[
        "Patient sign-in lands on the correct route",
        "Expired sessions route back to recovery",
        "The minimal page keeps room for future portal work"
      ]}
      role={USER_ROLE.PATIENT}
    />
  );
}
