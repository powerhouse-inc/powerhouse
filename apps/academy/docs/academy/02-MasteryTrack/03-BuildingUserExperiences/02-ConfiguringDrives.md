# Configure a Drive

A drive in Powerhouse is a container or a wrapper for documents and data. It's a place where you can organize and store your documents and share them with others. This guide will walk you through the process of configuring and managing drives in your Powerhouse environment.   

:::info **Prerequisites**

Before configuring a drive, ensure you have:
- Powerhouse [CLI installed](/academy/MasteryTrack/BuilderEnvironment/BuilderTools)
- Access to a Powerhouse instance
- Appropriate permissions to create and manage drives
:::

## Understanding Drives

### Local Drives

A local drive is a container for local documents and data, hosted on your local machine. Technically a drive is just another document model with a list of the documents inside the drive. When you run connect locally with `ph connect` a local drive is automatically added. You can also create a new local drive by clicking **'add drive'** in connect.

### Remote Drives vs. reactors 

Remote drives in Powerhouse allow you to connect to and work with data stored in external systems or cloud services. These drives act as bridges between Powerhouse contributors and/or other data sources, enabling seamless data synchronization. Drives can exist in 3 category locations.

- **Local Storage**: For offline or on-device access.
- **Cloud Storage**: For centralized, scalable data management.
- **Decentralized Storage**: Such as Ceramic or IPFS, enabling distributed and blockchain-based storage options.

:::tip **Explainer**
**Powerhouse Reactors** are the nodes in the network that store and synchronise documents & drives , resolve conflicts and rerun operations to verify document event histories. 
Reactors can be configured for local storage, centralized cloud storage or on a decentralized storage network. 

A reactor allows you to store multiple documents, but also host **drives** & Drive Explorers with different organisational purposes, users, access rights and more.
:::

A drive exists by making use of a reactor and the storagelayer that specific reactor is based on. A reactor is the lower level component that makes synchronisation of documents & drives possible. 

### Drive Apps 

**Drive Explorers** (also known as Drive Apps) are specialized interfaces that enhance how users interact with document models within a drive. As mentioned previously, technically a drive is just another document, with a list of the documents inside the drive. So it is obvious that you can create a custom editor for your drive-document. 

These customized editors are called Drive explorers or Drive Apps. They provide custom views, organization tools, and interactive features tailored to specific use cases. For example, a Drive Explorer might present data as a Kanban board, provide aggregated insights, or offer specialized widgets for data processing. 

To learn more about building and customizing Drive Explorers, check out our [Building a Drive Explorer](/academy/MasteryTrack/BuildingUserExperiences/BuildingADriveExplorer) guide.


## Creating a New Drive

![Create New Drive](./images/CreateNewDrive.png)

To create a new drive in Powerhouse, follow these steps:
1. Click on the "**Create New Drive**" button in the Connect interface or in the Connect sidebar on the (+) Icon. 
2. In the modal that appears, enter a name for your drive in the "**Drive Name**" field.
3. Select the desired Drive App (such as the Generic Drive Explorer, or any other Drive App you've installed).
4. Choose the location for your drive: **Local** (only available to you), **Cloud** (available to people in this drive), or **Public** (available to everyone).
5. (Optional) Enable the "Make available offline" toggle if you want to keep a local backup of your drive.
6. Once all options are set, click the "Create new drive" button to finalize and create your drive.

## Adding a New Remote Drive via GraphQL Mutation

You can also add a new remote drive to your Connect environment programmatically using GraphQL mutations. This is especially useful for automation, scripting, or integrating with external systems.

:::info **Prerequisites**
- Access to the Switchboard or remote reactor (server node) of your Connect instance.
- The GraphQL endpoint for your instance. For example, for the staging environment, use: `https://staging.switchboard.phd/graphql/system` (this is a supergraph gateway).
- Appropriate permissions to perform mutations.
:::

### Steps
1. **Navigate to the GraphQL Playground or use a GraphQL client**
   - Open [https://staging.switchboard.phd/graphql/system](https://staging.switchboard.phd/graphql/system) in your browser, or use a tool like [GraphQL Playground](https://www.apollographql.com/docs/apollo-server/testing/graphql-playground/).

2. **Prepare the Mutation**
   - Use the following mutation to create a new drive:

   ```graphql
   mutation Mutation($name: String!, $icon: String, $addDriveId: String, $slug: String) {
     addDrive(name: $name, icon: $icon, id: $addDriveId, slug: $slug) {
       icon
       id
       name
       slug
     }
   }
   ```

   - Example variables:
   ```json
   {
     "name": "AcademyTest",
     "icon": "https://static.thenounproject.com/png/3009860-200.png",
     "addDriveId": null,
     "slug": null
   }
   ```
   - You can also provide a custom `id`, `slug`, or `preferredEditor` if needed.

3. **Execute the Mutation**
   - Run the mutation. On success, you will receive a response containing the new drive's `icon`, `id`, `name`, and `slug`:

   ```json
   {
     "data": {
       "addDrive": {
         "icon": "https://static.thenounproject.com/png/3009860-200.png",
         "id": "6461580b-d317-4596-942d-f6b3d1bfc8fd",
         "name": "AcademyTest",
         "slug": "6461580b-d317-4596-942d-f6b3d1bfc8fd"
       }
     }
   }
   ```



4. **Construct the Drive URL**
   - Once you have the `id` or `slug`, you can construct the drive URL for Connect:
     - Format: `domain/d/driveId` or `domain/d/driveSlug`
     - Example: `https://staging.connect.phd/d/6461580b-d317-4596-942d-f6b3d1bfc8fd`

5. **Add the Drive in Connect**
   - Use the constructed URL to add or access the drive in your Connect environment.

---

This approach allows you to automate drive creation and integration with other systems, making it easy to manage drives at scale.


