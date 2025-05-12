#!/bin/bash

# Check if a path is provided as an argument
if [ -z "$1" ]; then
  echo "No path provided. Please provide a path to check."
  exit 1
fi

# Check if the provided path exists
if [ ! -d "$1" ]; then
  echo "The provided path '$1' does not exist."
  exit 1
fi

# Loop through all directories in the provided path
for dir in "$1"*/ ; do
  # Check if package.json exists in the directory
  if [[ -f "$dir/package.json" ]]; then
    echo "Checking dependencies in $dir"
    
    # Get devDependencies as a comma-separated list
    IGNORES=$(jq -r '.devDependencies | keys | join(",")' "$dir/package.json")

    # Run depcheck, ignoring devDependencies
    (cd "$dir" && npx depcheck --ignores="$IGNORES")
    
    echo "--------------------------------------"
  fi
done