# Build Document Editors

*Placeholder for a tutorial about building beautiful document editors.*

## Build with React on Powerhouse

At Powerhouse, frontend development follows a simple and familiar flow. Tailwind CSS is installed by default and fully managed by Connect Studio — you can use Tailwind classes freely, but you’re not required to. Regular CSS, inline styles, and any React-compatible styling method work exactly as you would expect in a standard React project. There is no need to manually configure or run Tailwind or build processes; **Connect Studio automatically handles everything during development.**

For component visualization and testing, **Connect Studio replaces the need for Storybook**. Please do not use Storybook by default — Connect Studio provides a dynamic, local environment where you can define and preview your document models and editors live. If you still wish to set up Storybook on your own, you may, but it is unsupported and discouraged.

During normal development, simply run Connect Studio with `ph connect`. Manual build commands are only needed when you publish a package, at which point the necessary build steps (including CSS generation) are handled automatically.

Powerhouse aims to keep your developer experience clean, familiar, and focused.
- Build React components as you would in any project.
- Use styling approaches you're comfortable with.
- Trust Connect Studio to handle the setup for you.

### Building with react hooks

What are React Hooks?

From the React docs:

"Hooks let you use different React features from your components. You can either use the built-in Hooks or combine them to build your own."
https://react.dev/reference/react/hooks

The "combine them to build your own" part is key here. A so-called "custom hook" is just a function that uses these built-in hooks.

There are several types of built-in hooks which are used to solve different problems.

For example:

State lets a component “remember” information like user input. 

Effects let a component connect to and synchronize with external systems.

Context lets a component receive information from distant parents without passing it as props.

Details about custom hooks are provided here: https://react.dev/learn/reusing-logic-with-custom-hooks

In summary, there are three reasons to use custom hooks:

To re-use logic that calls multiple hooks.
To abstract away the complexity of multiple hooks.
To isolate the side effects of the useEffect hook.

Hook names must start with use followed by a capital letter, like useState (built-in) or useOnlineStatus (custom, like earlier on the page). Hooks may return arbitrary values.

https://react.dev/learn/reusing-logic-with-custom-hooks#hook-names-always-start-with-use

When you use any function that starts with "use", react will treat it as a hook and expect it to follow the rules of hooks.

Rules of Hooks
https://react.dev/reference/rules/rules-of-hooks

Hooks are defined using JavaScript functions, but they represent a special type of reusable UI logic with restrictions on where they can be called.

Only call Hooks at the top level
Only call Hooks from React functions

React needs these rules to ensure that the state is properly managed and that the component behaves as expected.

So it is indeed possible to create a "hook" like so:

```
function useCurrentTime() {
  const currentTime = new Date().toLocaleTimeString();

  return currentTime;
}
```

And this is technically a hook, but making it a hook is pointless because it doesn't use any of the built-in hooks.

There is no reason that this could not just be:

```
function getCurrentTime() {
  return new Date().toLocaleTimeString();
}
```

Because in a component, both hooks and normal functions are called on every render.

So if your component looks like this:

```
function MyComponent() {
  const currentTimeFromFunc = getCurrentTime();
}
```

or this:

```
function MyComponent() {
  const currentTimeFromHook = useCurrentTime();
}
```

The end result would be the same. The function would be called on every render.

So in summary, the only reason a function should be a hook is if it uses one or more built-in hooks.

In general, you will not want to take a normal function and turn it into a hook, because your normal function should not have been trying to use react hooks in the first place.

## Powerhouse Component Library

TBD