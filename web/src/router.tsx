import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import OverviewPage from "./pages/OverviewPage";
import NamespacesPage from "./pages/NamespacesPage";
import NodesPage from "./pages/NodesPage";
import WorkloadsPage from "./pages/WorkloadsPage";
import AgentsPage from "./pages/AgentsPage";
import ConnectCloudPage from "./pages/ConnectCloudPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "namespaces", element: <NamespacesPage /> },
      { path: "nodes", element: <NodesPage /> },
      { path: "workloads", element: <WorkloadsPage /> },
      { path: "agents", element: <AgentsPage /> },
      { path: "connect-cloud", element: <ConnectCloudPage /> }
    ]
  }
]);

export default router;
