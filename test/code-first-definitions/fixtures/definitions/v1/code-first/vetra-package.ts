import {
  defineDocumentModel,
  defineDocumentModelFamily,
  ph,
  type EnumDescriptor,
  type InputDescriptor,
  type InterfaceDescriptor,
  type LegacySpecificationCompatibility,
  type ObjectDescriptor,
  type UnionDescriptor,
} from "document-model";

function createVetraPackageV1() {
const VetraPackageState: ObjectDescriptor = ph.object("VetraPackageState", {
description: "Package metadata used to publish a Vetra Reactor Package to npm and surface\nit inside Connect/Switchboard. All fields are optional so a package can be\ncreated empty and filled in incrementally during development.",
fields: {
"name": ph.String(),
"description": ph.String(),
"category": ph.String(),
"author": ph.ref(() => Author, { required: true }),
"keywords": ph.list(ph.ref(() => Keyword, { required: true }), { required: true }),
"githubUrl": ph.URL(),
"npmUrl": ph.URL()
},
});

const Author: ObjectDescriptor = ph.object("Author", {
description: "Author/maintainer of the Vetra Package.",
fields: {
"name": ph.String(),
"website": ph.URL()
},
});

const Keyword: ObjectDescriptor = ph.object("Keyword", {
description: "A single search keyword attached to the package.",
fields: {
"id": ph.OID({ required: true }),
"label": ph.String({ required: true })
},
});

const model = defineDocumentModel({
  id: "powerhouse/package",
  name: "Vetra Package",
  description: "Manifest for a Vetra Reactor Package: bundles the metadata (name, description, category, author, keywords, source links) used to publish and discover the package in the Powerhouse ecosystem. Create one Vetra Package document per project; the document models, editors, processors, and subgraphs you add to the project are registered against this package at build time.",
  extension: ".pkg",
  version: 1,
  author: {"name":"Powerhouse","website":"https://powerhouse.inc"},
  changeLog: [],
  specifications: {
    auxiliaryTypes: [Author, Keyword],
    global: {
      schema: VetraPackageState,
      initialValue: {"name":null,"description":null,"category":null,"author":{"name":null,"website":null},"keywords":[],"githubUrl":null,"npmUrl":null},
      examples: [],
    },
    local: {
      schema: null,
      initialValue: {},
      examples: [],
    },
  },
});

const module0 = model.module("base_operations", {
description: "Setters for the package's identity, author, keywords, and source/distribution links.",
operations: ({ global, local }) => ({
"setPackageName": global({
description: "Set the human-readable package name shown in listings and the Connect UI.",
input: ph.input("SetPackageNameInput", { fields: {
"name": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setPackageDescription": global({
description: "Set the one-paragraph summary describing what the package does.",
input: ph.input("SetPackageDescriptionInput", { fields: {
"description": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setPackageCategory": global({
description: "Set the category label used to group the package in directories (e.g. \"Finance\", \"Productivity\").",
input: ph.input("SetPackageCategoryInput", { fields: {
"category": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setPackageAuthor": global({
description: "Replace the author block in a single call. Either field may be omitted to clear it.",
input: ph.input("SetPackageAuthorInput", { fields: {
"name": ph.OID(),
"website": ph.URL()
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setPackageAuthorName": global({
description: "Set only the author's display name without touching the website field.",
input: ph.input("SetPackageAuthorNameInput", { fields: {
"name": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setPackageAuthorWebsite": global({
description: "Set only the author's website URL without touching the name field.",
input: ph.input("SetPackageAuthorWebsiteInput", { fields: {
"website": ph.URL({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"addPackageKeyword": global({
description: "Append a search keyword. Caller supplies a stable id so the entry can be removed later.",
input: ph.input("AddPackageKeywordInput", { fields: {
"id": ph.String({ required: true }),
"label": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"removePackageKeyword": global({
description: "Remove a keyword by its id. No-op if the id does not exist.",
input: ph.input("RemovePackageKeywordInput", { fields: {
"id": ph.String({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setPackageGithubUrl": global({
description: "Set the public source code URL (typically a GitHub repository).",
input: ph.input("SetPackageGithubUrlInput", { fields: {
"url": ph.URL({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
}),
"setPackageNpmUrl": global({
description: "Set the published npm package URL once the package has been released.",
input: ph.input("SetPackageNpmUrlInput", { fields: {
"url": ph.URL({ required: true })
} }),
template: "",
reducerTemplate: "",
reduceLegacy(_state, _action, _dispatch) {},
})
}),
});

const compatibility: LegacySpecificationCompatibility = {
  "kind": "explicit-legacy",
  "definition": {
    "version": 1,
    "scalars": [
      {
        "name": "OID",
        "implementation": "powerhouse.catalog#OID",
        "coercionProfile": "document-engineering-1.40"
      },
      {
        "name": "URL",
        "implementation": "powerhouse.catalog#URL",
        "coercionProfile": "document-engineering-1.40"
      }
    ],
    "graphQLCompatibility": {
      "kind": "graphql-ast-v1",
      "document": {
        "kind": "Document",
        "definitions": [
          {
            "kind": "ObjectTypeDefinition",
            "description": {
              "kind": "StringValue",
              "value": "Package metadata used to publish a Vetra Reactor Package to npm and surface\nit inside Connect/Switchboard. All fields are optional so a package can be\ncreated empty and filled in incrementally during development.",
              "block": true
            },
            "name": {
              "kind": "Name",
              "value": "VetraPackageState"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Human-readable package name (e.g. 'Pizza Plaza'). Distinct from the npm package id.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "name"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "One-paragraph summary of what the package provides. Shown on package listing pages.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "description"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Free-form category label used to group packages in directories (e.g. 'Finance', 'Productivity').",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "category"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Author/maintainer information surfaced in the published package metadata.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "author"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "Author"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Search keywords associated with the package. Each keyword has a stable id so it can be removed individually.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "keywords"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "ListType",
                    "type": {
                      "kind": "NonNullType",
                      "type": {
                        "kind": "NamedType",
                        "name": {
                          "kind": "Name",
                          "value": "Keyword"
                        }
                      }
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Public source code URL (typically a GitHub repository).",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "githubUrl"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "URL"
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Published npm package URL. Set once the package has been released.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "npmUrl"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "URL"
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "description": {
              "kind": "StringValue",
              "value": "Author/maintainer of the Vetra Package.",
              "block": true
            },
            "name": {
              "kind": "Name",
              "value": "Author"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Display name of the author or organization.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "name"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "String"
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Author's website URL.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "website"
                },
                "arguments": [],
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "URL"
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "ObjectTypeDefinition",
            "description": {
              "kind": "StringValue",
              "value": "A single search keyword attached to the package.",
              "block": true
            },
            "name": {
              "kind": "Name",
              "value": "Keyword"
            },
            "interfaces": [],
            "directives": [],
            "fields": [
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Stable identifier for the keyword entry; used to remove it.",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "OID"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "FieldDefinition",
                "description": {
                  "kind": "StringValue",
                  "value": "Display label for the keyword (e.g. 'invoicing', 'defi').",
                  "block": true
                },
                "name": {
                  "kind": "Name",
                  "value": "label"
                },
                "arguments": [],
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "SetPackageNameInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "name"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "SetPackageDescriptionInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "description"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "SetPackageCategoryInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "category"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "SetPackageAuthorInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "name"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "OID"
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "website"
                },
                "type": {
                  "kind": "NamedType",
                  "name": {
                    "kind": "Name",
                    "value": "URL"
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "SetPackageAuthorNameInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "name"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "SetPackageAuthorWebsiteInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "website"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "URL"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "AddPackageKeywordInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              },
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "label"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "RemovePackageKeywordInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "id"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "String"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "SetPackageGithubUrlInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "url"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "URL"
                    }
                  }
                },
                "directives": []
              }
            ]
          },
          {
            "kind": "InputObjectTypeDefinition",
            "name": {
              "kind": "Name",
              "value": "SetPackageNpmUrlInput"
            },
            "directives": [],
            "fields": [
              {
                "kind": "InputValueDefinition",
                "name": {
                  "kind": "Name",
                  "value": "url"
                },
                "type": {
                  "kind": "NonNullType",
                  "type": {
                    "kind": "NamedType",
                    "name": {
                      "kind": "Name",
                      "value": "URL"
                    }
                  }
                },
                "directives": []
              }
            ]
          }
        ]
      },
      "preserveDefinitionOrder": true
    },
    "types": [
      {
        "kind": "object",
        "name": "VetraPackageState",
        "description": "Package metadata used to publish a Vetra Reactor Package to npm and surface\nit inside Connect/Switchboard. All fields are optional so a package can be\ncreated empty and filled in incrementally during development.",
        "fields": [
          {
            "key": "name",
            "name": "name",
            "description": "Human-readable package name (e.g. 'Pizza Plaza'). Distinct from the npm package id.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          },
          {
            "key": "description",
            "name": "description",
            "description": "One-paragraph summary of what the package provides. Shown on package listing pages.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          },
          {
            "key": "category",
            "name": "category",
            "description": "Free-form category label used to group packages in directories (e.g. 'Finance', 'Productivity').",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          },
          {
            "key": "author",
            "name": "author",
            "description": "Author/maintainer information surfaced in the published package metadata.",
            "deprecated": null,
            "type": {
              "kind": "named",
              "name": "Author",
              "required": true
            }
          },
          {
            "key": "keywords",
            "name": "keywords",
            "description": "Search keywords associated with the package. Each keyword has a stable id so it can be removed individually.",
            "deprecated": null,
            "type": {
              "kind": "list",
              "required": true,
              "item": {
                "kind": "named",
                "name": "Keyword",
                "required": true
              }
            }
          },
          {
            "key": "githubUrl",
            "name": "githubUrl",
            "description": "Public source code URL (typically a GitHub repository).",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "URL",
              "required": false
            }
          },
          {
            "key": "npmUrl",
            "name": "npmUrl",
            "description": "Published npm package URL. Set once the package has been released.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "URL",
              "required": false
            }
          }
        ]
      },
      {
        "kind": "object",
        "name": "Author",
        "description": "Author/maintainer of the Vetra Package.",
        "fields": [
          {
            "key": "name",
            "name": "name",
            "description": "Display name of the author or organization.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": false
            }
          },
          {
            "key": "website",
            "name": "website",
            "description": "Author's website URL.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "URL",
              "required": false
            }
          }
        ]
      },
      {
        "kind": "object",
        "name": "Keyword",
        "description": "A single search keyword attached to the package.",
        "fields": [
          {
            "key": "id",
            "name": "id",
            "description": "Stable identifier for the keyword entry; used to remove it.",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "OID",
              "required": true
            }
          },
          {
            "key": "label",
            "name": "label",
            "description": "Display label for the keyword (e.g. 'invoicing', 'defi').",
            "deprecated": null,
            "type": {
              "kind": "scalar",
              "name": "String",
              "required": true
            }
          }
        ]
      }
    ],
    "state": {
      "global": {
        "root": {
          "kind": "named",
          "name": "VetraPackageState",
          "required": true
        },
        "initialValue": {
          "name": null,
          "description": null,
          "category": null,
          "author": {
            "name": null,
            "website": null
          },
          "keywords": [],
          "githubUrl": null,
          "npmUrl": null
        },
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "\"\"\"\nPackage metadata used to publish a Vetra Reactor Package to npm and surface\nit inside Connect/Switchboard. All fields are optional so a package can be\ncreated empty and filled in incrementally during development.\n\"\"\"\ntype VetraPackageState {\n  \"\"\"Human-readable package name (e.g. 'Pizza Plaza'). Distinct from the npm package id.\"\"\"\n  name: String\n  \"\"\"One-paragraph summary of what the package provides. Shown on package listing pages.\"\"\"\n  description: String\n  \"\"\"Free-form category label used to group packages in directories (e.g. 'Finance', 'Productivity').\"\"\"\n  category: String\n  \"\"\"Author/maintainer information surfaced in the published package metadata.\"\"\"\n  author: Author!\n  \"\"\"Search keywords associated with the package. Each keyword has a stable id so it can be removed individually.\"\"\"\n  keywords: [Keyword!]!\n  \"\"\"Public source code URL (typically a GitHub repository).\"\"\"\n  githubUrl: URL\n  \"\"\"Published npm package URL. Set once the package has been released.\"\"\"\n  npmUrl: URL\n}\n\n\"\"\"Author/maintainer of the Vetra Package.\"\"\"\ntype Author {\n  \"\"\"Display name of the author or organization.\"\"\"\n  name: String\n  \"\"\"Author's website URL.\"\"\"\n  website: URL\n}\n\n\"\"\"A single search keyword attached to the package.\"\"\"\ntype Keyword {\n  \"\"\"Stable identifier for the keyword entry; used to remove it.\"\"\"\n  id: OID!\n  \"\"\"Display label for the keyword (e.g. 'invoicing', 'defi').\"\"\"\n  label: String!\n}",
          "initialValue": "{\n  \"name\": null,\n  \"description\": null,\n  \"category\": null,\n  \"author\": {\n    \"name\": null,\n    \"website\": null\n  },\n  \"keywords\": [],\n  \"githubUrl\": null,\n  \"npmUrl\": null\n}",
          "examples": []
        }
      },
      "local": {
        "root": null,
        "initialValue": {},
        "examples": [],
        "unknownKeys": "preserve",
        "materialized": {
          "schema": "",
          "initialValue": "",
          "examples": []
        }
      }
    },
    "modules": [
      {
        "id": "a6156f32-8120-43a5-be8b-51c7feaa3460",
        "key": "base_operations",
        "name": "base_operations",
        "description": "Setters for the package's identity, author, keywords, and source/distribution links.",
        "operations": [
          {
            "id": "33f2eab7-9e07-497f-a4e6-53e50968c3c9",
            "key": "SET_PACKAGE_NAME",
            "name": "SET_PACKAGE_NAME",
            "description": "Set the human-readable package name shown in listings and the Connect UI.",
            "actionType": "SET_PACKAGE_NAME",
            "creatorKey": "setPackageName",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetPackageNameInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "name",
                  "name": "name",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "a07bee80-c2a8-40d7-891b-822ee298d7d9",
            "key": "SET_PACKAGE_DESCRIPTION",
            "name": "SET_PACKAGE_DESCRIPTION",
            "description": "Set the one-paragraph summary describing what the package does.",
            "actionType": "SET_PACKAGE_DESCRIPTION",
            "creatorKey": "setPackageDescription",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetPackageDescriptionInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "description",
                  "name": "description",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "f3ad82f8-580a-4c6e-b930-e203cda998bb",
            "key": "SET_PACKAGE_CATEGORY",
            "name": "SET_PACKAGE_CATEGORY",
            "description": "Set the category label used to group the package in directories (e.g. \"Finance\", \"Productivity\").",
            "actionType": "SET_PACKAGE_CATEGORY",
            "creatorKey": "setPackageCategory",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetPackageCategoryInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "category",
                  "name": "category",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "67f43579-ce98-47e6-bf48-27c0f44818b9",
            "key": "SET_PACKAGE_AUTHOR",
            "name": "SET_PACKAGE_AUTHOR",
            "description": "Replace the author block in a single call. Either field may be omitted to clear it.",
            "actionType": "SET_PACKAGE_AUTHOR",
            "creatorKey": "setPackageAuthor",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetPackageAuthorInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "name",
                  "name": "name",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "OID",
                    "required": false
                  }
                },
                {
                  "key": "website",
                  "name": "website",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "URL",
                    "required": false
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "94ba44c4-9627-405e-9ea2-34e9da1c283a",
            "key": "SET_PACKAGE_AUTHOR_NAME",
            "name": "SET_PACKAGE_AUTHOR_NAME",
            "description": "Set only the author's display name without touching the website field.",
            "actionType": "SET_PACKAGE_AUTHOR_NAME",
            "creatorKey": "setPackageAuthorName",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetPackageAuthorNameInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "name",
                  "name": "name",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "3d5c08df-6c14-480b-915b-875941979fd0",
            "key": "SET_PACKAGE_AUTHOR_WEBSITE",
            "name": "SET_PACKAGE_AUTHOR_WEBSITE",
            "description": "Set only the author's website URL without touching the name field.",
            "actionType": "SET_PACKAGE_AUTHOR_WEBSITE",
            "creatorKey": "setPackageAuthorWebsite",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetPackageAuthorWebsiteInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "website",
                  "name": "website",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "URL",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "ed95f841-6fd0-4552-898d-e915599b7495",
            "key": "ADD_PACKAGE_KEYWORD",
            "name": "ADD_PACKAGE_KEYWORD",
            "description": "Append a search keyword. Caller supplies a stable id so the entry can be removed later.",
            "actionType": "ADD_PACKAGE_KEYWORD",
            "creatorKey": "addPackageKeyword",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "AddPackageKeywordInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "id",
                  "name": "id",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                },
                {
                  "key": "label",
                  "name": "label",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "83c4db24-bd2f-424d-9e26-751580d6307b",
            "key": "REMOVE_PACKAGE_KEYWORD",
            "name": "REMOVE_PACKAGE_KEYWORD",
            "description": "Remove a keyword by its id. No-op if the id does not exist.",
            "actionType": "REMOVE_PACKAGE_KEYWORD",
            "creatorKey": "removePackageKeyword",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "RemovePackageKeywordInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "id",
                  "name": "id",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "String",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "83a90530-8535-4ea7-ab53-7865532398f7",
            "key": "SET_PACKAGE_GITHUB_URL",
            "name": "SET_PACKAGE_GITHUB_URL",
            "description": "Set the public source code URL (typically a GitHub repository).",
            "actionType": "SET_PACKAGE_GITHUB_URL",
            "creatorKey": "setPackageGithubUrl",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetPackageGithubUrlInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "url",
                  "name": "url",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "URL",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          },
          {
            "id": "e789859a-01ee-4b60-8e7e-a3ad928a26d1",
            "key": "SET_PACKAGE_NPM_URL",
            "name": "SET_PACKAGE_NPM_URL",
            "description": "Set the published npm package URL once the package has been released.",
            "actionType": "SET_PACKAGE_NPM_URL",
            "creatorKey": "setPackageNpmUrl",
            "scope": "global",
            "input": {
              "kind": "input",
              "name": "SetPackageNpmUrlInput",
              "description": null,
              "unknownKeys": "preserve",
              "fields": [
                {
                  "key": "url",
                  "name": "url",
                  "description": null,
                  "deprecated": null,
                  "type": {
                    "kind": "scalar",
                    "name": "URL",
                    "required": true
                  }
                }
              ]
            },
            "errors": [],
            "examples": [],
            "template": "",
            "reducer": ""
          }
        ]
      }
    ],
    "changeLog": []
  },
  "materialized": {
    "state": {
      "local": {
        "schema": "",
        "examples": [],
        "initialValue": ""
      },
      "global": {
        "schema": "\"\"\"\nPackage metadata used to publish a Vetra Reactor Package to npm and surface\nit inside Connect/Switchboard. All fields are optional so a package can be\ncreated empty and filled in incrementally during development.\n\"\"\"\ntype VetraPackageState {\n  \"\"\"Human-readable package name (e.g. 'Pizza Plaza'). Distinct from the npm package id.\"\"\"\n  name: String\n  \"\"\"One-paragraph summary of what the package provides. Shown on package listing pages.\"\"\"\n  description: String\n  \"\"\"Free-form category label used to group packages in directories (e.g. 'Finance', 'Productivity').\"\"\"\n  category: String\n  \"\"\"Author/maintainer information surfaced in the published package metadata.\"\"\"\n  author: Author!\n  \"\"\"Search keywords associated with the package. Each keyword has a stable id so it can be removed individually.\"\"\"\n  keywords: [Keyword!]!\n  \"\"\"Public source code URL (typically a GitHub repository).\"\"\"\n  githubUrl: URL\n  \"\"\"Published npm package URL. Set once the package has been released.\"\"\"\n  npmUrl: URL\n}\n\n\"\"\"Author/maintainer of the Vetra Package.\"\"\"\ntype Author {\n  \"\"\"Display name of the author or organization.\"\"\"\n  name: String\n  \"\"\"Author's website URL.\"\"\"\n  website: URL\n}\n\n\"\"\"A single search keyword attached to the package.\"\"\"\ntype Keyword {\n  \"\"\"Stable identifier for the keyword entry; used to remove it.\"\"\"\n  id: OID!\n  \"\"\"Display label for the keyword (e.g. 'invoicing', 'defi').\"\"\"\n  label: String!\n}",
        "examples": [],
        "initialValue": "{\n  \"name\": null,\n  \"description\": null,\n  \"category\": null,\n  \"author\": {\n    \"name\": null,\n    \"website\": null\n  },\n  \"keywords\": [],\n  \"githubUrl\": null,\n  \"npmUrl\": null\n}"
      }
    },
    "modules": [
      {
        "id": "a6156f32-8120-43a5-be8b-51c7feaa3460",
        "name": "base_operations",
        "description": "Setters for the package's identity, author, keywords, and source/distribution links.",
        "operations": [
          {
            "id": "33f2eab7-9e07-497f-a4e6-53e50968c3c9",
            "name": "SET_PACKAGE_NAME",
            "description": "Set the human-readable package name shown in listings and the Connect UI.",
            "schema": "input SetPackageNameInput {\n  name: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "a07bee80-c2a8-40d7-891b-822ee298d7d9",
            "name": "SET_PACKAGE_DESCRIPTION",
            "description": "Set the one-paragraph summary describing what the package does.",
            "schema": "input SetPackageDescriptionInput {\n  description: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "f3ad82f8-580a-4c6e-b930-e203cda998bb",
            "name": "SET_PACKAGE_CATEGORY",
            "description": "Set the category label used to group the package in directories (e.g. \"Finance\", \"Productivity\").",
            "schema": "input SetPackageCategoryInput {\n  category: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "67f43579-ce98-47e6-bf48-27c0f44818b9",
            "name": "SET_PACKAGE_AUTHOR",
            "description": "Replace the author block in a single call. Either field may be omitted to clear it.",
            "schema": "input SetPackageAuthorInput {\n  name: OID\n  website: URL\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "94ba44c4-9627-405e-9ea2-34e9da1c283a",
            "name": "SET_PACKAGE_AUTHOR_NAME",
            "description": "Set only the author's display name without touching the website field.",
            "schema": "input SetPackageAuthorNameInput {\n  name: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "3d5c08df-6c14-480b-915b-875941979fd0",
            "name": "SET_PACKAGE_AUTHOR_WEBSITE",
            "description": "Set only the author's website URL without touching the name field.",
            "schema": "input SetPackageAuthorWebsiteInput {\n  website: URL!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "ed95f841-6fd0-4552-898d-e915599b7495",
            "name": "ADD_PACKAGE_KEYWORD",
            "description": "Append a search keyword. Caller supplies a stable id so the entry can be removed later.",
            "schema": "input AddPackageKeywordInput {\n  id: String!\n  label: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "83c4db24-bd2f-424d-9e26-751580d6307b",
            "name": "REMOVE_PACKAGE_KEYWORD",
            "description": "Remove a keyword by its id. No-op if the id does not exist.",
            "schema": "input RemovePackageKeywordInput {\n  id: String!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "83a90530-8535-4ea7-ab53-7865532398f7",
            "name": "SET_PACKAGE_GITHUB_URL",
            "description": "Set the public source code URL (typically a GitHub repository).",
            "schema": "input SetPackageGithubUrlInput {\n  url: URL!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          },
          {
            "id": "e789859a-01ee-4b60-8e7e-a3ad928a26d1",
            "name": "SET_PACKAGE_NPM_URL",
            "description": "Set the published npm package URL once the package has been released.",
            "schema": "input SetPackageNpmUrlInput {\n  url: URL!\n}",
            "template": "",
            "reducer": "",
            "errors": [],
            "examples": [],
            "scope": "global"
          }
        ]
      }
    ],
    "version": 1,
    "changeLog": []
  }
};
return model.version({
  modules: [module0],
  compatibility,
});
}

const VetraPackageFamily = defineDocumentModelFamily({
  versions: [createVetraPackageV1()],
  upgrades: [],
});

export const VetraPackageV1 = VetraPackageFamily.at(1);
export const documentModels = VetraPackageFamily.modules;
export const upgradeManifests = [VetraPackageFamily.upgradeManifest];
