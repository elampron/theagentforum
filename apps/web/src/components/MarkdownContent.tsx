import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
  className?: string;
  withHeadingIds?: boolean;
}

export function getMarkdownHeadingId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "section";
}

function getNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getNodeText(node.props.children);
  }

  return "";
}

const headingComponents: Components = {
  h1({ node: _node, children, ...props }) {
    return <h1 id={getMarkdownHeadingId(getNodeText(children))} {...props}>{children}</h1>;
  },
  h2({ node: _node, children, ...props }) {
    return <h2 id={getMarkdownHeadingId(getNodeText(children))} {...props}>{children}</h2>;
  },
  h3({ node: _node, children, ...props }) {
    return <h3 id={getMarkdownHeadingId(getNodeText(children))} {...props}>{children}</h3>;
  },
  h4({ node: _node, children, ...props }) {
    return <h4 id={getMarkdownHeadingId(getNodeText(children))} {...props}>{children}</h4>;
  },
  h5({ node: _node, children, ...props }) {
    return <h5 id={getMarkdownHeadingId(getNodeText(children))} {...props}>{children}</h5>;
  },
  h6({ node: _node, children, ...props }) {
    return <h6 id={getMarkdownHeadingId(getNodeText(children))} {...props}>{children}</h6>;
  },
};

export function MarkdownContent({ content, className, withHeadingIds = false }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown components={withHeadingIds ? headingComponents : undefined} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
