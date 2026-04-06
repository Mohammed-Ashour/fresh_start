import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: "Search the web using DuckDuckGo. Returns search results with titles, URLs, and snippets.",
    promptSnippet: "Search the web for current information",
    promptGuidelines: [
      "Use this tool when you need current information from the internet",
      "Search queries should be concise and specific",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      max_results: Type.Optional(Type.Number({ description: "Maximum results to return (default: 5)" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const maxResults = params.max_results ?? 5;
      
      onUpdate?.({ content: [{ type: "text", text: `Searching for: ${params.query}...` }] });
      
      try {
        const response = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(params.query)}&format=json&no_html=1`,
          { signal }
        );
        
        if (!response.ok) {
          return {
            content: [{ type: "text", text: `Search failed: ${response.statusText}` }],
            isError: true,
          };
        }
        
        const data = await response.json();
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        
        if (data.RelatedTopics) {
          for (const topic of data.RelatedTopics.slice(0, maxResults)) {
            if (topic.Result && topic.FirstURL) {
              results.push({
                title: topic.Text?.split(' - ')[0] || topic.FirstURL,
                url: topic.FirstURL,
                snippet: topic.Text || "",
              });
            }
          }
        }
        
        if (results.length === 0) {
          return {
            content: [{ type: "text", text: "No results found." }],
          };
        }
        
        let output = `## Search Results for "${params.query}"\n\n`;
        for (let i = 0; i < results.length; i++) {
          output += `### ${i + 1}. ${results[i].title}\n`;
          output += `URL: ${results[i].url}\n`;
          output += `${results[i].snippet}\n\n`;
        }
        
        return {
          content: [{ type: "text", text: output }],
          details: { results },
        };
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return {
            content: [{ type: "text", text: "Search cancelled." }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: `Search error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description: "Fetch content from a URL and return it as text or markdown. Use this to read full content from URLs found via web_search.",
    promptSnippet: "Fetch and read content from URLs",
    promptGuidelines: [
      "Use this tool to get full content from URLs returned by web_search",
      "The content is returned as markdown for easy reading",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch" }),
      format: Type.Optional(Type.String({ description: "Output format: text or markdown (default: markdown)" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const format = params.format ?? "markdown";
      
      onUpdate?.({ content: [{ type: "text", text: `Fetching: ${params.url}...` }] });
      
      try {
        const response = await fetch(params.url, { signal });
        
        if (!response.ok) {
          return {
            content: [{ type: "text", text: `Fetch failed: ${response.status} ${response.statusText}` }],
            isError: true,
          };
        }
        
        const html = await response.text();
        
        // Simple HTML to text/markdown conversion
        let content = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
          .replace(/<!--[\s\S]*?-->/g, "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<h1[^>]*>/gi, "\n# ")
          .replace(/<\/h1>/gi, "\n")
          .replace(/<h2[^>]*>/gi, "\n## ")
          .replace(/<\/h2>/gi, "\n")
          .replace(/<h3[^>]*>/gi, "\n### ")
          .replace(/<\/h3>/gi, "\n")
          .replace(/<h4[^>]*>/gi, "\n#### ")
          .replace(/<\/h4>/gi, "\n")
          .replace(/<li[^>]*>/gi, "\n- ")
          .replace(/<\/li>/gi, "")
          .replace(/<a[^>]*href="([^"]*)"[^>]*>/gi, "[$1](")
          .replace(/<\/a>/gi, ")")
          .replace(/<code[^>]*>/gi, "`")
          .replace(/<\/code>/gi, "`")
          .replace(/<pre[^>]*>/gi, "\n```\n")
          .replace(/<\/pre>/gi, "\n```\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        
        // Limit content length
        const maxLength =50000;
        if (content.length > maxLength) {
          content = content.slice(0, maxLength) + "\n\n... [content truncated]";
        }
        
        return {
          content: [{ type: "text", text: content }],
          details: { url: params.url, format, length: content.length },
        };
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return {
            content: [{ type: "text", text: "Fetch cancelled." }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: `Fetch error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    },
  });
}