import { useEffect, useId, useState } from "react";
import rehypeKatex from "rehype-katex";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

interface MermaidDiagramProps {
  chart: string;
}

function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "dark",
        });

        const result = await mermaid.render(`taf-mermaid-${id}`, chart);

        if (!cancelled) {
          setSvg(result.svg);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          setSvg(null);
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (failed) {
    return (
      <pre className="markdown-mermaid-fallback">
        <code>{chart}</code>
      </pre>
    );
  }

  if (!svg) {
    return <div className="markdown-diagram markdown-diagram--loading" aria-label="Rendering diagram" />;
  }

  return (
    <figure
      className="markdown-diagram"
      aria-label="Rendered Mermaid diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const markdownComponents: Components = {
  a({ children, href, ...props }) {
    const isExternal = href ? /^https?:\/\//i.test(href) : false;

    return (
      <a href={href} rel={isExternal ? "noreferrer" : undefined} target={isExternal ? "_blank" : undefined} {...props}>
        {children}
      </a>
    );
  },
  code({ children, className, ...props }) {
    const value = String(children).replace(/\n$/, "");
    const match = /language-(\w+)/.exec(className ?? "");

    if (match?.[1] === "mermaid") {
      return <MermaidDiagram chart={value} />;
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  img({ alt, className, ...props }) {
    const imageClassName = ["markdown-media", className].filter(Boolean).join(" ");

    return <img alt={alt ?? ""} className={imageClassName} loading="lazy" decoding="async" {...props} />;
  },
  table({ children, ...props }) {
    return (
      <div className="markdown-table-scroll">
        <table {...props}>{children}</table>
      </div>
    );
  },
};

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown components={markdownComponents} rehypePlugins={[rehypeKatex]} remarkPlugins={[remarkGfm, remarkMath]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
