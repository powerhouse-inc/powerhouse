#!/bin/bash

echo "🧹 Resetting environment..."
echo ""

# Function to remove all folders and .ts files in a directory except index.ts
remove_folders_except_index() {
    local dir=$1
    echo "Cleaning $dir..."

    # Check if directory exists
    if [ ! -d "$dir" ]; then
        echo "⚠️  Directory $dir does not exist, skipping..."
        return
    fi

    # Find and remove all directories in the specified path
    find "$dir" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} \;

    # Find and remove all .ts files except index.ts
    find "$dir" -mindepth 1 -maxdepth 1 -type f -name "*.ts" ! -name "index.ts" -exec rm -f {} \;

    # Reset index.ts to only contain export {};
    echo "export {};" > "$dir/index.ts"

    echo "✅ $dir cleaned and index.ts reset"
}

# Clean document-models
remove_folders_except_index "document-models"

# Clean editors  
remove_folders_except_index "editors"

# Clean processors
remove_folders_except_index "processors"

# Clean subgraphs
remove_folders_except_index "subgraphs"

# Remove .ph directory
echo "Removing .ph directory..."
if [ -d ".ph" ]; then
    rm -rf .ph
    echo "✅ .ph directory removed"
else
    echo "⚠️  .ph directory does not exist, skipping..."
fi

# Remove backup-documents
if [ -d "backup-documents" ]; then
    rm -rf backup-documents
    echo "✅ backup-documents directory removed"
else
    echo "⚠️  backup-documents directory does not exist, skipping..."
fi

echo ""
echo "🎉 Environment reset complete!"
echo ""
echo "All directories have been cleaned and index.ts files reset to 'export {};'"
