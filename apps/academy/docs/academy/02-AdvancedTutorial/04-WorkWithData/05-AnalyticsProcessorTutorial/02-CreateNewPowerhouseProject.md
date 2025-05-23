# Create New Powerhouse Project

Before we start diving into the tutorial, lets have a quick look at all the steps we'll go through. 

1. We'll set up a powerhouse project and navigate to the newly created project directory to launch an analytics processor. 
2. Afterwards we'll run a new Reactor instance. A Reactor instance is a local (or remote) node in the Powerhouse network.
3. We'll create a new Real World Asset (RWA) Portfolio document model on the reactor node and add multiple purchase transactions to it. 
4. We'll observe how the analytics processor receives the operations we've added to the document in the previous step. 
5. We'll stop the reactor & replace our default code with the analytics processor code so it can calculate the different metrics & dimensions we want to see.
4. Finally we'll run the analytics processor engine on the document model and look at the total value of specific asset classses on a monthly basis, add more data and adjust the granularity of the data we want to see.

This tuturial should give you a good understanding of how the analytics processor works and how you can use it to listen, query and combine data from multiple document models or dimensions.
Offering you the option to cut and slice your data in any way you want.

Let's start with step 1 & 2 in the next section of the tutorial!

To create a new Powerhouse Document Model Library project, you can use the `ph init` command in your terminal. This command will create a new project in the current directory.

## Create New Powerhouse Document Model Library Project

:::info
This command will create a new project in the current directory.
You can run the command in the terminal window of your OS or you open the newly installed VSCode and run the command in the terminal window of VSCode.
You will need VSCode later in the tutorial once you have generated the document model.
Make sure the terminal reflects the directory where you want to create the new project.
To open a directory in a terminal, you use the cd command to change your current directory. The cd command takes an argument, usually the name of the folder you want to move to, so the full command is 
```bash
cd your-directory
```
This essentially opens that folder and places you in it.
:::

Once you've navigated to the directory where you want to create the new project and in your terminal, run the following command:

```bash
`ph init`
```

In the terminal, you will be asked to enter the project name. Fill in the project name and press enter.
Since we'll be using the Analytics Processor on a Real World Asset report (RWA), we'll name the project `rwa-analytics`.

```bash
? What is the project name? ‣ rwa-analytics
```	

Once the project is created and the dependencies are installed (which can take a few minutes), you will see the following output:

```bash
 The installation is done!

 You can start by typing:
    cd rwa-analytics-demo
```

Great! You've created a new powerhouse project, let's move on to the next step.