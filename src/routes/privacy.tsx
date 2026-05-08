import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — CurateTube" },
      {
        name: "description",
        content:
          "How CurateTube handles personal data, including audit identity, anonymity, and account deletion.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Effective: at launch. We will revise this as features ship.
      </p>

      <section className="prose prose-sm mt-8 max-w-none text-foreground">
        <h2>What we store</h2>
        <p>
          When you create an account we store your email, an opaque user id, and
          the profile fields you provide (display name, username, avatar). We
          store actions you take in an internal audit log so moderators can
          maintain library quality.
        </p>

        <h2>Audit identity</h2>
        <p>
          By default, your audit identity is <strong>Anonymous</strong>. Internal
          audit entries record your user id for accountability but the rendered
          actor is "Anonymous contributor". You can switch to <strong>Public</strong>{" "}
          attribution any time in Profile → Settings → Audit identity. Owners
          retain forensic access to resolve abuse cases, gated by a dedicated
          permission and logged.
        </p>

        <h2>Public attribution</h2>
        <p>
          Some surfaces (e.g. "Originally submitted by …" chips) only render
          your display name when you have opted into Public attribution.
        </p>

        <h2>Account deletion</h2>
        <p>
          You can delete your account from Profile → Settings. Deletion uses a
          7-day grace window and is tailored to your sign-in method. Personal
          lists are removed; submissions and approvals stay in the library with
          actor set to "Deleted user" so curation history remains accurate.
        </p>

        <h2>Cookies</h2>
        <p>We use only the cookies required to keep you signed in.</p>

        <h2>Contact</h2>
        <p>Questions? Reach out to the site owner.</p>
      </section>
    </main>
  );
}
