import { Route, Router } from "preact-router";
import Home from "./app/home";
import User from "./app/user";
import GraphQL from "./app/graphql";
import GraphQLDrive from "./app/graphql/drive";
import Header from "./components/header/header";

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
