import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";

/** Any address the app has no page for. */
export function NotFound() {
  return (
    <section className="page">
      <EmptyState title="Page not found">
        <p>There's nothing at this address. It may have moved, or the link may be mistyped.</p>
        <p>
          <Link to="/" className="btn">
            Go to Home
          </Link>
        </p>
      </EmptyState>
    </section>
  );
}
