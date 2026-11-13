import { adminRoutes } from "@/components/admin/admin-routes";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { ButtonLink } from "@/components/ui/button";

/** An address under Content that isn't one of its sections (an old link, say), inside the dashboard rather than the public 404. */
export default function ContentNotFound() {
  return (
    <>
      <PageHeader title="Content" />
      <EmptyState
        title="There's no such part of your website"
        actions={
          <ButtonLink href={adminRoutes.content} variant="secondary">
            See all your content
          </ButtonLink>
        }
        className="max-w-form"
      >
        The link may be old or mistyped. Everything you can change is listed on the content page.
      </EmptyState>
    </>
  );
}
