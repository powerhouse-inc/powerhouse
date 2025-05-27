# Build with Scalars

Scalars are here to help you define custom fields in your document model schema and speed up the development process.
There are two applications of scalar components in the document model workflow:

1. At the **schema definition** level where you build your schema and write your GraphQL state schema.
2. At the **frontend / react** level where you import it and place it in your UI to represent the scalar field

## Scalar Definition in the Document Model Schema

As you might know, the document model schema defines the structure of the document and serves as the backbone of the document model. The GraphQL state schema defines how data is captured with the help of types & scalars. When you define a scalar in the document model schema, you are essentially defining a new field that can be used in the document model to capture data.

In the Document Model Editor, you can find all the custom scalar types available in our documentation under the 'Scalars' section.

Insert image of the feature. 

````
scalar PHID <-- imported from the design system library? not sure
type MyType {
  myScalar: PHID
}   
````

## React Component Implementation in the Frontend

All of our reusable components are available in the design system library or package.
This package comes as a dependency in your project when creating a new document model project.
````
import PHIDField from 'design-system'
const reactComponent = () => {

return (
  <div>
    <PHIDField
      fetchOptionsCallback={function Js(){}}
      fetchSelectedOptionCallback={function Js(){}}
      label="PHID field"
      name="phid-field"
      placeholder="phd:"
    />

  </div>
  
  )

}
````

## Scalars & Reusable Components

To make your life easier, Powerhouse has defined all useful scalars with a set of reusable code and UI components.
The reusable components are essentially a set of front-end components based on GraphQL scalars. Powerhouse also has a set of custom scalars that are not part of the GraphQL standard but are specific to the web3 ecosystem.

Read the next chapter to get familiar with our reusable components. 