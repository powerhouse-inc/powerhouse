import React from "react";

interface LLMProvider {
  name: string;
  icon: string;
  baseUrl: string;
  promptParam: string;
}

const llmProviders: LLMProvider[] = [
  {
    name: "ChatGPT",
    icon: "⭕", // You can replace with actual icons
    baseUrl: "https://chat.openai.com/",
    promptParam: "q",
  },
  {
    name: "Claude",
    icon: "✦",
    baseUrl: "https://claude.ai/chat/",
    promptParam: "q",
  },
  {
    name: "Grok",
    icon: "⚡",
    baseUrl: "https://x.ai/grok/",
    promptParam: "q",
  },
];

interface LLMRedirectProps {
  prompt: string;
  title: string;
  description?: string;
}

export default function LLMRedirect({
  prompt,
  title,
  description,
}: LLMRedirectProps) {
  const generatePrompt = (basePrompt: string) => {
    return `${basePrompt}

Please use the Powerhouse Academy documentation as context. You can download the complete documentation from: https://academy.vetra.io/academy_LLM_docs.md

This documentation includes:
- Complete API references
- Getting started tutorials  
- Architecture guides
- Example use cases
- Component library docs

Focus your response on Powerhouse-specific concepts and implementations.`;
  };

  const handleLLMClick = (provider: LLMProvider) => {
    const fullPrompt = generatePrompt(prompt);
    const encodedPrompt = encodeURIComponent(fullPrompt);

    // Different LLMs have different URL patterns
    let url: string;

    switch (provider.name) {
      case "ChatGPT":
        url = `https://chat.openai.com/?q=${encodedPrompt}`;
        break;
      case "Claude":
        url = `https://claude.ai/chat?q=${encodedPrompt}`;
        break;
      case "Grok":
        url = `https://x.com/i/grok?q=${encodedPrompt}`;
        break;
      default:
        url = `${provider.baseUrl}?${provider.promptParam}=${encodedPrompt}`;
    }

    window.open(url, "_blank");
  };

  return (
    <div
      className="llm-redirect-container"
      style={{
        border: "1px solid #e1e5e9",
        borderRadius: "12px",
        padding: "24px",
        margin: "16px 0",
        backgroundColor: "#f8f9fa",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "8px", fontSize: "18px" }}>
        {title}
      </h3>

      {description && (
        <p style={{ marginBottom: "16px", color: "#666", fontSize: "14px" }}>
          {description}
        </p>
      )}

      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {llmProviders.map((provider) => (
          <button
            key={provider.name}
            onClick={() => handleLLMClick(provider)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 20px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              backgroundColor: "white",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
              transition: "all 0.2s ease",
              minWidth: "120px",
              justifyContent: "center",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#f0f0f0";
              e.currentTarget.style.borderColor = "#999";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "white";
              e.currentTarget.style.borderColor = "#ddd";
            }}
          >
            <span style={{ fontSize: "16px" }}>{provider.icon}</span>
            {provider.name}
          </button>
        ))}
      </div>

      <p
        style={{
          marginTop: "12px",
          marginBottom: 0,
          fontSize: "12px",
          color: "#888",
          textAlign: "center",
        }}
      >
        Click to open in your preferred LLM with Powerhouse Academy context
      </p>
    </div>
  );
}
