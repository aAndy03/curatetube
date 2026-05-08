import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — CurateTube" },
      {
        name: "description",
        content:
          "Acceptable use rules for the CurateTube community-curated YouTube database.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Effective: at launch.
      </p>
      <section className="prose prose-sm mt-8 max-w-none text-foreground">
        <h2>Use of the service</h2>
        <p>
          CurateTube is a community-curated public database of YouTube videos
          and creators. You agree to submit only content that complies with
          YouTube's terms and applicable law.
        </p>
        <h2>Roles &amp; moderation</h2>
        <p>
          Submissions are reviewed by curators. The Owner and Admins may revoke
          permissions, remove content, or suspend accounts in response to
          violations.
        </p>
        <h2>Liability</h2>
        <p>
          The service is provided as-is. We are not responsible for content
          hosted on YouTube.
        </p>
      </section>
    </main>
  );
}
