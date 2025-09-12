import { Route, Router } from "preact-router";
import Home from "./app/home.js";
import User from "./app/user.js";
import GraphQL from "./app/graphql.js";
import GraphQLDrive from "./app/graphql/drive.js";
import Header from "./components/header/header.js";

export function App() {
  return (
    <div className="bg-gray-100">
      <Header />
      <Router>
        <Route path="/" component={Home} />
        <Route path="/user" component={User} />
        <Route path="/graphql" component={GraphQL} />
        <Route path="/graphql/:driveId" component={GraphQLDrive} />
      </Router>
    </div>
  );
}
