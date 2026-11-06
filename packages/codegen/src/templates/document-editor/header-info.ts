export const documentHeaderInfo = `{/* Document header info */}
        <div className="mb-6 grid grid-cols-2 gap-x-8">
          <label>
            <h3 className="text-base">ID</h3>
            <input
              type="text"
              value={document.header.id}
              readOnly
              className="font-mono"
            />
          </label>
          <label>
            <h3 className="text-base">Created</h3>
            <input
              type="text"
              value={new Date(document.header.createdAtUtcIso).toLocaleString()}
              readOnly
            />
          </label>
          <label>
            <h3 className="text-base">Type</h3>
            <input type="text" value={document.header.documentType} readOnly />
          </label>
          <label>
            <h3 className="text-base">Last Modified</h3>
            <input
              type="text"
              value={new Date(
                document.header.lastModifiedAtUtcIso,
              ).toLocaleString()}
              readOnly
            />
          </label>
        </div>`;
