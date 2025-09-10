import { useState } from "react";
import { useDebounce } from "../../hooks/index.js";
import type { Keyword } from "../../../document-models/vetra-package/index.js";

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
    <div className="grid grid-cols-1 gap-6 bg-white p-6 lg:grid-cols-3">
      {/* Left Column */}
      <div className="space-y-6">
        {/* Name Field */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Description Field */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Middle Column */}
      <div className="space-y-6">
        {/* Category Field */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => {
              const newValue = e.target.value;
              setCategory(newValue);
              onCategoryChange?.(newValue);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Publisher
          </label>
          <input
            type="text"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Publisher URL Field */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Publisher URL
          </label>
          <input
            type="text"
            value={publisherUrl}
            onChange={(e) => setPublisherUrl(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Keywords Field */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Keywords
          </label>
          <div className="space-y-2">
            <input
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex min-h-[80px] flex-wrap gap-2 rounded-md border border-gray-300 p-3">
              {keywords.map((keyword) => (
                <span
                  key={keyword.id}
                  className="inline-flex items-center rounded border border-blue-300 bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
                >
                  {keyword.label}
                  <button
                    onClick={() => {
                      setKeywords(keywords.filter((k) => k.id !== keyword.id));
                      onRemoveKeyword?.(keyword.id);
                    }}
                    className="ml-1 text-blue-600 hover:text-blue-800 focus:outline-none"
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
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Github Repository
          </label>
          <input
            type="text"
            value={githubRepository}
            onChange={(e) => setGithubRepository(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* NPM-package Field */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            NPM-package
          </label>
          <input
            type="text"
            value={npmPackage}
            onChange={(e) => setNpmPackage(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Version Field */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Version
          </label>
          <input
            type="text"
            placeholder="1.0.0-dev"
            readOnly
            className="w-full cursor-not-allowed rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
          />
        </div>

        {/* License Field */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            License
          </label>
          <input
            type="text"
            placeholder="AGPL-3.0-only"
            readOnly
            className="w-full cursor-not-allowed rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
          />
        </div>

        {/* Install with Field */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Install with:
          </label>
          <input
            type="text"
            placeholder="@powerhousedao/todo-demo-package"
            readOnly
            className="w-full cursor-not-allowed rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
          />
        </div>
      </div>
    </div>
  );
};
