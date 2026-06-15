import { useState } from "react";
import type { Keyword } from "../../../document-models/vetra-package/index.js";
import { useDebounce } from "../../hooks/index.js";

export interface MetaFormProps {
  name: string;
  description: string;
  category: string;
  publisher: string;
  publisherUrl: string;
  githubRepository: string;
  npmPackage: string;
  keywords: Keyword[];
  onNameChange?: (name: string) => void;
  onDescriptionChange?: (description: string) => void;
  onCategoryChange?: (category: string) => void;
  onPublisherChange?: (publisher: string) => void;
  onPublisherUrlChange?: (publisherUrl: string) => void;
  onGithubRepositoryChange?: (githubRepository: string) => void;
  onNpmPackageChange?: (npmPackage: string) => void;
  onAddKeyword?: (keyword: { id: string; label: string }) => void;
  onRemoveKeyword?: (id: string) => void;
}

export const MetaForm: React.FC<MetaFormProps> = (props) => {
  const {
    name: initialName,
    description: initialDescription,
    category: initialCategory,
    publisher: initialPublisher,
    publisherUrl: initialPublisherUrl,
    githubRepository: initialGithubRepository,
    npmPackage: initialNpmPackage,
    keywords: initialKeywords,
    onNameChange,
    onDescriptionChange,
    onCategoryChange,
    onPublisherChange,
    onPublisherUrlChange,
    onGithubRepositoryChange,
    onNpmPackageChange,
    onAddKeyword,
    onRemoveKeyword,
  } = props;

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [category, setCategory] = useState(initialCategory);
  const [publisher, setPublisher] = useState(initialPublisher);
  const [publisherUrl, setPublisherUrl] = useState(initialPublisherUrl);
  const [githubRepository, setGithubRepository] = useState(
    initialGithubRepository,
  );
  const [npmPackage, setNpmPackage] = useState(initialNpmPackage);

  // Keywords state
  const [keywords, setKeywords] = useState<Keyword[]>(initialKeywords);
  const [keywordInput, setKeywordInput] = useState("");

  // Use the debounce hook with callbacks
  useDebounce(name, onNameChange, 300);
  useDebounce(description, onDescriptionChange, 300);
  useDebounce(publisher, onPublisherChange, 300);
  useDebounce(publisherUrl, onPublisherUrlChange, 300);
  useDebounce(githubRepository, onGithubRepositoryChange, 300);
  useDebounce(npmPackage, onNpmPackageChange, 300);

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
      {/* Left Column */}
      <div className="space-y-6">
        {/* Name Field */}
        <div>
          <label
            htmlFor="package-name"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Name
          </label>
          <input
            id="package-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:ring-2 focus:ring-ring focus:outline-none disabled:disabled-effect"
          />
        </div>

        {/* Description Field */}
        <div>
          <label
            htmlFor="package-description"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Description
          </label>
          <textarea
            id="package-description"
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full resize-none rounded-md border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:ring-2 focus:ring-ring focus:outline-none disabled:disabled-effect"
          />
        </div>
      </div>

      {/* Middle Column */}
      <div className="space-y-6">
        {/* Category Field */}
        <div>
          <label
            htmlFor="package-category"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Category
          </label>
          <select
            id="package-category"
            value={category}
            onChange={(e) => {
              const newValue = e.target.value;
              setCategory(newValue);
              onCategoryChange?.(newValue);
            }}
            className="w-full rounded-md border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:ring-2 focus:ring-ring focus:outline-none disabled:disabled-effect"
          >
            <option value="">Not selected</option>
            <option value="Productivity">Productivity</option>
            <option value="Governance">Governance</option>
            <option value="Project Management">Project Management</option>
            <option value="Finance">Finance</option>
            <option value="Legal">Legal</option>
            <option value="People & Culture">People & Culture</option>
            <option value="Engineering">Engineering</option>
          </select>
        </div>

        {/* Publisher Field */}
        <div>
          <label
            htmlFor="package-publisher"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Publisher
          </label>
          <input
            id="package-publisher"
            type="text"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:ring-2 focus:ring-ring focus:outline-none disabled:disabled-effect"
          />
        </div>

        {/* Publisher URL Field */}
        <div>
          <label
            htmlFor="package-publisher-url"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Publisher URL
          </label>
          <input
            id="package-publisher-url"
            type="text"
            value={publisherUrl}
            onChange={(e) => setPublisherUrl(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:ring-2 focus:ring-ring focus:outline-none disabled:disabled-effect"
          />
        </div>

        {/* Keywords Field */}
        <div>
          <label
            htmlFor="package-keywords"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Keywords
          </label>
          <div className="space-y-2">
            <input
              id="package-keywords"
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && keywordInput.trim()) {
                  e.preventDefault();
                  const newKeyword = {
                    id: Date.now().toString(), // Generate a unique ID
                    label: keywordInput.trim(),
                  };
                  setKeywords([...keywords, newKeyword]);
                  onAddKeyword?.(newKeyword);
                  setKeywordInput("");
                }
              }}
              placeholder="Type a keyword and press Enter"
              className="w-full rounded-md border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:ring-2 focus:ring-ring focus:outline-none disabled:disabled-effect"
            />
            <div className="flex min-h-[80px] flex-wrap gap-2 rounded-md border border-border p-3">
              {keywords.map((keyword) => (
                <span
                  key={keyword.id}
                  className="inline-flex items-center rounded-sm border border-info bg-info/10 px-2 py-0.5 text-xs text-info"
                >
                  {keyword.label}
                  <button
                    onClick={() => {
                      setKeywords(keywords.filter((k) => k.id !== keyword.id));
                      onRemoveKeyword?.(keyword.id);
                    }}
                    className="ml-1 text-info hover:hover-effect focus:outline-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="space-y-6">
        {/* Github Repository Field */}
        <div>
          <label
            htmlFor="package-github"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Github Repository
          </label>
          <input
            id="package-github"
            type="text"
            value={githubRepository}
            onChange={(e) => setGithubRepository(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:ring-2 focus:ring-ring focus:outline-none disabled:disabled-effect"
          />
        </div>

        {/* NPM-package Field */}
        <div>
          <label
            htmlFor="package-npm"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            NPM-package
          </label>
          <input
            id="package-npm"
            type="text"
            value={npmPackage}
            onChange={(e) => setNpmPackage(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:ring-2 focus:ring-ring focus:outline-none disabled:disabled-effect"
          />
        </div>

        {/* Version Field */}
        <div>
          <label
            htmlFor="package-version"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Version
          </label>
          <input
            id="package-version"
            type="text"
            placeholder="1.0.0-dev"
            disabled
            className="w-full cursor-not-allowed rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground disabled:disabled-effect"
          />
        </div>

        {/* License Field */}
        <div>
          <label
            htmlFor="package-license"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            License
          </label>
          <input
            id="package-license"
            type="text"
            placeholder="AGPL-3.0-only"
            disabled
            className="w-full cursor-not-allowed rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground disabled:disabled-effect"
          />
        </div>

        {/* Install with Field */}
        <div>
          <label
            htmlFor="package-install"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Install with:
          </label>
          <input
            id="package-install"
            type="text"
            placeholder="@powerhousedao/todo-demo-package"
            disabled
            className="w-full cursor-not-allowed rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground disabled:disabled-effect"
          />
        </div>
      </div>
    </div>
  );
};
