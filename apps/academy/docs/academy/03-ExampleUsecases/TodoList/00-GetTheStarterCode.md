# Step 0 - get the starter code

Normally you would initialize a new powerhouse project by running `ph init` with your project name. But since this is a tutorial, we want to provide branches with the final code for each step.

Just for the tutorial, please instead make a fork of [this repository](https://github.com/powerhouse-inc/todo-tutorial). 

*NOTE:* please _uncheck_ the checkbox that says "copy the main branch only" when making your fork — we want to keep the other branches for each step.

Once you have your fork, clone it to your machine with `git clone`, the GitHub desktop app or the GitHub cli.

The starter branch of this tutorial is: `step-1-generate-todo-list-document-model`.

Checkout that branch, and then create your own branch from it with whatever name you want, something like `do-the-tutorial` will work nicely.

The code at the step 1 branch of this repository is exactly the same as what you would get if you ran `ph init todo-tutorial`.

Each step in this tutorial has two branches associated with it. One is the starting point and the other is the final code after the step is complete. They each have names like `step-1-` for the starting point and `step-1-complete-` for the complete code. You can use the starting point branches if you want to start at a later step or skip a step, and you can use the complete code to compare with your branch if you get stuck.

To compare your branch, either do `git diff my-branch step-complete-branch` or use the "compare with branch" option in the GitHub desktop app.

Finally, run `pnpm install` to install the project dependencies. 

Now we're ready to get started.

