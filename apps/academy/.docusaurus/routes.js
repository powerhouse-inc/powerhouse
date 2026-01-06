import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/__docusaurus/debug',
    component: ComponentCreator('/__docusaurus/debug', '5ff'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/config',
    component: ComponentCreator('/__docusaurus/debug/config', '5ba'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/content',
    component: ComponentCreator('/__docusaurus/debug/content', 'a2b'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/globalData',
    component: ComponentCreator('/__docusaurus/debug/globalData', 'c3c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/metadata',
    component: ComponentCreator('/__docusaurus/debug/metadata', '156'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/registry',
    component: ComponentCreator('/__docusaurus/debug/registry', '88c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/routes',
    component: ComponentCreator('/__docusaurus/debug/routes', '000'),
    exact: true
  },
  {
    path: '/blog',
    component: ComponentCreator('/blog', '625'),
    exact: true
  },
  {
    path: '/blog/archive',
    component: ComponentCreator('/blog/archive', '182'),
    exact: true
  },
  {
    path: '/blog/Graphql-schema-as-a-common-language',
    component: ComponentCreator('/blog/Graphql-schema-as-a-common-language', '386'),
    exact: true
  },
  {
    path: '/blog/Rapid-Application-Development-with-document-models.',
    component: ComponentCreator('/blog/Rapid-Application-Development-with-document-models.', '71f'),
    exact: true
  },
  {
    path: '/blog/tags',
    component: ComponentCreator('/blog/tags', '287'),
    exact: true
  },
  {
    path: '/blog/tags/dao',
    component: ComponentCreator('/blog/tags/dao', '00c'),
    exact: true
  },
  {
    path: '/blog/tags/design-thinking',
    component: ComponentCreator('/blog/tags/design-thinking', '09a'),
    exact: true
  },
  {
    path: '/blog/tags/graph-ql',
    component: ComponentCreator('/blog/tags/graph-ql', '5dd'),
    exact: true
  },
  {
    path: '/blog/tags/product',
    component: ComponentCreator('/blog/tags/product', 'acd'),
    exact: true
  },
  {
    path: '/blog/tags/schemas',
    component: ComponentCreator('/blog/tags/schemas', 'e84'),
    exact: true
  },
  {
    path: '/blog/tags/tooling',
    component: ComponentCreator('/blog/tags/tooling', '207'),
    exact: true
  },
  {
    path: '/markdown-page',
    component: ComponentCreator('/markdown-page', '3d7'),
    exact: true
  },
  {
    path: '/search',
    component: ComponentCreator('/search', '5de'),
    exact: true
  },
  {
    path: '/',
    component: ComponentCreator('/', '810'),
    routes: [
      {
        path: '/',
        component: ComponentCreator('/', '5d9'),
        routes: [
          {
            path: '/',
            component: ComponentCreator('/', '000'),
            routes: [
              {
                path: '/academy/APIReferences/DriveAnalyticsHooks',
                component: ComponentCreator('/academy/APIReferences/DriveAnalyticsHooks', 'd94'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/APIReferences/PHDocumentMigrationGuide',
                component: ComponentCreator('/academy/APIReferences/PHDocumentMigrationGuide', '1f7'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/APIReferences/PowerhouseCLI',
                component: ComponentCreator('/academy/APIReferences/PowerhouseCLI', '289'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/APIReferences/ReactHooks',
                component: ComponentCreator('/academy/APIReferences/ReactHooks', '742'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/APIReferences/RelationalDatabase',
                component: ComponentCreator('/academy/APIReferences/RelationalDatabase', 'e03'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/APIReferences/renown-sdk/APIReference',
                component: ComponentCreator('/academy/APIReferences/renown-sdk/APIReference', '12a'),
                exact: true
              },
              {
                path: '/academy/APIReferences/renown-sdk/Authentication',
                component: ComponentCreator('/academy/APIReferences/renown-sdk/Authentication', '56e'),
                exact: true
              },
              {
                path: '/academy/APIReferences/renown-sdk/CLIIdentity',
                component: ComponentCreator('/academy/APIReferences/renown-sdk/CLIIdentity', '261'),
                exact: true
              },
              {
                path: '/academy/APIReferences/renown-sdk/Overview',
                component: ComponentCreator('/academy/APIReferences/renown-sdk/Overview', 'dfd'),
                exact: true
              },
              {
                path: '/academy/APIReferences/VetraRemoteDrive',
                component: ComponentCreator('/academy/APIReferences/VetraRemoteDrive', '0b6'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/Architecture/PowerhouseArchitecture',
                component: ComponentCreator('/academy/Architecture/PowerhouseArchitecture', 'aa0'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/Architecture/WorkingWithTheReactor',
                component: ComponentCreator('/academy/Architecture/WorkingWithTheReactor', '29d'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ComponentLibrary/CreateCustomScalars',
                component: ComponentCreator('/academy/ComponentLibrary/CreateCustomScalars', '230'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ComponentLibrary/DocumentEngineering',
                component: ComponentCreator('/academy/ComponentLibrary/DocumentEngineering', 'b94'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ComponentLibrary/IntegrateIntoAReactComponent',
                component: ComponentCreator('/academy/ComponentLibrary/IntegrateIntoAReactComponent', '9c4'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/Cookbook',
                component: ComponentCreator('/academy/Cookbook', '28c'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/Chatroom/CreateNewPowerhouseProject',
                component: ComponentCreator('/academy/ExampleUsecases/Chatroom/CreateNewPowerhouseProject', '7f8'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/Chatroom/DefineChatroomDocumentModel',
                component: ComponentCreator('/academy/ExampleUsecases/Chatroom/DefineChatroomDocumentModel', 'e06'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/Chatroom/ImplementChatroomEditor',
                component: ComponentCreator('/academy/ExampleUsecases/Chatroom/ImplementChatroomEditor', 'a2b'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/Chatroom/ImplementOperationReducers',
                component: ComponentCreator('/academy/ExampleUsecases/Chatroom/ImplementOperationReducers', 'dc1'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/Overview',
                component: ComponentCreator('/academy/ExampleUsecases/Overview', '224'),
                exact: true
              },
              {
                path: '/academy/ExampleUsecases/TodoList/AddSharedComponentForShowingTodoListStats',
                component: ComponentCreator('/academy/ExampleUsecases/TodoList/AddSharedComponentForShowingTodoListStats', 'abd'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/TodoList/AddTestsForTodoListActions',
                component: ComponentCreator('/academy/ExampleUsecases/TodoList/AddTestsForTodoListActions', 'eca'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/TodoList/GenerateTodoDriveExplorer',
                component: ComponentCreator('/academy/ExampleUsecases/TodoList/GenerateTodoDriveExplorer', 'da1'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/TodoList/GenerateTodoListDocumentEditor',
                component: ComponentCreator('/academy/ExampleUsecases/TodoList/GenerateTodoListDocumentEditor', '26a'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/TodoList/GenerateTodoListDocumentModel',
                component: ComponentCreator('/academy/ExampleUsecases/TodoList/GenerateTodoListDocumentModel', '1df'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/TodoList/GetTheStarterCode',
                component: ComponentCreator('/academy/ExampleUsecases/TodoList/GetTheStarterCode', 'ee1'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/TodoList/ImplementTodoListDocumentEditorUIComponents',
                component: ComponentCreator('/academy/ExampleUsecases/TodoList/ImplementTodoListDocumentEditorUIComponents', '6f8'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/TodoList/ImplementTodoListDocumentModelReducerOperationHandlers',
                component: ComponentCreator('/academy/ExampleUsecases/TodoList/ImplementTodoListDocumentModelReducerOperationHandlers', '6e0'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/ExampleUsecases/VetraPackageLibrary',
                component: ComponentCreator('/academy/ExampleUsecases/VetraPackageLibrary', '4a5'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/GetStarted/BuildToDoListEditor',
                component: ComponentCreator('/academy/GetStarted/BuildToDoListEditor', '18e'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/GetStarted/CreateNewPowerhouseProject',
                component: ComponentCreator('/academy/GetStarted/CreateNewPowerhouseProject', 'f95'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/GetStarted/DefineToDoListDocumentModel',
                component: ComponentCreator('/academy/GetStarted/DefineToDoListDocumentModel', '061'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/GetStarted/ExploreDemoPackage',
                component: ComponentCreator('/academy/GetStarted/ExploreDemoPackage', '14b'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/GetStarted/ImplementOperationReducers',
                component: ComponentCreator('/academy/GetStarted/ImplementOperationReducers', '748'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/GetStarted/WriteDocumentModelTests',
                component: ComponentCreator('/academy/GetStarted/WriteDocumentModelTests', 'fc0'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/Glossary',
                component: ComponentCreator('/academy/Glossary', '0af'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/BuilderEnvironment/CreateAPackageWithVetra',
                component: ComponentCreator('/academy/MasteryTrack/BuilderEnvironment/CreateAPackageWithVetra', '7d7'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/BuilderEnvironment/Prerequisites',
                component: ComponentCreator('/academy/MasteryTrack/BuilderEnvironment/Prerequisites', '95a'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/BuilderEnvironment/VetraStudio',
                component: ComponentCreator('/academy/MasteryTrack/BuilderEnvironment/VetraStudio', 'e2c'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization',
                component: ComponentCreator('/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization', '8e8'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/BuildingUserExperiences/Authorization/DocumentPermissions',
                component: ComponentCreator('/academy/MasteryTrack/BuildingUserExperiences/Authorization/DocumentPermissions', '782'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/BuildingUserExperiences/Authorization/RenownAuthenticationFlow',
                component: ComponentCreator('/academy/MasteryTrack/BuildingUserExperiences/Authorization/RenownAuthenticationFlow', '6c6'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/BuildingUserExperiences/BuildingADriveExplorer',
                component: ComponentCreator('/academy/MasteryTrack/BuildingUserExperiences/BuildingADriveExplorer', '852'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/BuildingUserExperiences/BuildingDocumentEditors',
                component: ComponentCreator('/academy/MasteryTrack/BuildingUserExperiences/BuildingDocumentEditors', '22d'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/BuildingUserExperiences/DocumentTools/DocumentToolbar',
                component: ComponentCreator('/academy/MasteryTrack/BuildingUserExperiences/DocumentTools/DocumentToolbar', 'dd0'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/BuildingUserExperiences/DocumentTools/OperationHistory',
                component: ComponentCreator('/academy/MasteryTrack/BuildingUserExperiences/DocumentTools/OperationHistory', 'a74'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/ConnectTools/InspectorModal',
                component: ComponentCreator('/academy/MasteryTrack/ConnectTools/InspectorModal', 'fea'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/DocumentModelCreation/ExampleToDoListRepository',
                component: ComponentCreator('/academy/MasteryTrack/DocumentModelCreation/ExampleToDoListRepository', '6b8'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/DocumentModelCreation/ImplementDocumentModelTests',
                component: ComponentCreator('/academy/MasteryTrack/DocumentModelCreation/ImplementDocumentModelTests', 'a63'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/DocumentModelCreation/ImplementDocumentReducers',
                component: ComponentCreator('/academy/MasteryTrack/DocumentModelCreation/ImplementDocumentReducers', 'fe3'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/DocumentModelCreation/SpecifyDocumentOperations',
                component: ComponentCreator('/academy/MasteryTrack/DocumentModelCreation/SpecifyDocumentOperations', 'cd4'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/DocumentModelCreation/SpecifyTheStateSchema',
                component: ComponentCreator('/academy/MasteryTrack/DocumentModelCreation/SpecifyTheStateSchema', '099'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/DocumentModelCreation/UseTheDocumentModelGenerator',
                component: ComponentCreator('/academy/MasteryTrack/DocumentModelCreation/UseTheDocumentModelGenerator', '6d8'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/DocumentModelCreation/WhatIsADocumentModel',
                component: ComponentCreator('/academy/MasteryTrack/DocumentModelCreation/WhatIsADocumentModel', '01a'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/Launch/ConfigureEnvironment',
                component: ComponentCreator('/academy/MasteryTrack/Launch/ConfigureEnvironment', '308'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/Launch/DockerDeployment',
                component: ComponentCreator('/academy/MasteryTrack/Launch/DockerDeployment', 'e1f'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/Launch/PublishYourProject',
                component: ComponentCreator('/academy/MasteryTrack/Launch/PublishYourProject', '1d8'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/Launch/SetupEnvironment',
                component: ComponentCreator('/academy/MasteryTrack/Launch/SetupEnvironment', 'b7a'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/best-practices',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/best-practices', '4da'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/graphql',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/graphql', 'b8e'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/GraphQL References/QueryingADocumentWithGraphQL',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/GraphQL References/QueryingADocumentWithGraphQL', '81d'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/graphql/integration',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/graphql/integration', '9ae'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/intro',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/intro', 'e1c'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript', 'f8f'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/benchmarks',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/benchmarks', '222'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/browser',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/browser', '986'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/compatibility',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/compatibility', '369'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/memory',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/memory', 'aab'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/pg',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/pg', '9ee'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/schema',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/schema', '01c'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/utilities',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/typescript/utilities', '332'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/use-cases',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/use-cases', 'acd'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/use-cases/maker',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/use-cases/maker', 'f45'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/Analytics Engine/use-cases/processors',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/Analytics Engine/use-cases/processors', 'bb7'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/analytics-processor',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/analytics-processor', '877'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/ConfiguringDrives',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/ConfiguringDrives', 'a1f'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/RelationalDbProcessor',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/RelationalDbProcessor', 'f22'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/UsingSubgraphs',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/UsingSubgraphs', 'c38'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/MasteryTrack/WorkWithData/UsingTheAPI',
                component: ComponentCreator('/academy/MasteryTrack/WorkWithData/UsingTheAPI', '6b5'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/academy/TodoListTutorial/AddSharedComponentForShowingTodoListStats',
                component: ComponentCreator('/academy/TodoListTutorial/AddSharedComponentForShowingTodoListStats', '87d'),
                exact: true
              },
              {
                path: '/academy/TodoListTutorial/AddTestsForTodoListActions',
                component: ComponentCreator('/academy/TodoListTutorial/AddTestsForTodoListActions', 'e15'),
                exact: true
              },
              {
                path: '/academy/TodoListTutorial/ImplementTodoListDocumentEditorUIComponents',
                component: ComponentCreator('/academy/TodoListTutorial/ImplementTodoListDocumentEditorUIComponents', 'cb2'),
                exact: true
              },
              {
                path: '/academy/TodoListTutorial/ImplementTodoListDocumentModelReducerOperationHandlers',
                component: ComponentCreator('/academy/TodoListTutorial/ImplementTodoListDocumentModelReducerOperationHandlers', '958'),
                exact: true
              },
              {
                path: '/bookofpowerhouse/DevelopmentApproaches',
                component: ComponentCreator('/bookofpowerhouse/DevelopmentApproaches', 'ac5'),
                exact: true
              },
              {
                path: '/bookofpowerhouse/GeneralFrameworkAndPhilosophy',
                component: ComponentCreator('/bookofpowerhouse/GeneralFrameworkAndPhilosophy', 'ab7'),
                exact: true
              },
              {
                path: '/bookofpowerhouse/Overview',
                component: ComponentCreator('/bookofpowerhouse/Overview', '319'),
                exact: true
              },
              {
                path: '/bookofpowerhouse/PowerhouseSoftwareArchitecture',
                component: ComponentCreator('/bookofpowerhouse/PowerhouseSoftwareArchitecture', 'f76'),
                exact: true
              },
              {
                path: '/bookofpowerhouse/SNOsandANewModelForOSSandPublicGoods',
                component: ComponentCreator('/bookofpowerhouse/SNOsandANewModelForOSSandPublicGoods', 'ceb'),
                exact: true
              },
              {
                path: '/bookofpowerhouse/SNOsInActionAndPlatformEconomies',
                component: ComponentCreator('/bookofpowerhouse/SNOsInActionAndPlatformEconomies', 'c00'),
                exact: true
              },
              {
                path: '/category/authorization',
                component: ComponentCreator('/category/authorization', '54a'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/category/building-user-experiences',
                component: ComponentCreator('/category/building-user-experiences', 'ff5'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/category/chatroom',
                component: ComponentCreator('/category/chatroom', 'df7'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/category/connect-tools',
                component: ComponentCreator('/category/connect-tools', '39a'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/category/document-model-creation',
                component: ComponentCreator('/category/document-model-creation', '149'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/category/document-tools',
                component: ComponentCreator('/category/document-tools', 'be2'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/category/launch',
                component: ComponentCreator('/category/launch', 'f75'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/category/todo-list-tutorial',
                component: ComponentCreator('/category/todo-list-tutorial', 'e3b'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/category/work-with-data',
                component: ComponentCreator('/category/work-with-data', 'dfe'),
                exact: true,
                sidebar: "academySidebar"
              },
              {
                path: '/',
                component: ComponentCreator('/', '8de'),
                exact: true,
                sidebar: "academySidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
