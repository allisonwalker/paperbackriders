import Link from "next/link";

type PublicPageName = "catalog" | "analytics";

const links: { page: PublicPageName; href: string; label: string }[] = [
  { page: "catalog", href: "/", label: "Catalog" },
  { page: "analytics", href: "/analytics", label: "Analytics" },
];

export function PublicNav({ current }: { current: PublicPageName }) {
  return (
    <nav className="public-nav" aria-label="Pages">
      {links.map((link) => (
        <Link key={link.href} href={link.href} aria-current={link.page === current ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
