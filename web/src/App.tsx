import { Outlet } from "react-router-dom";
import LayoutShell from "./components/layout/LayoutShell";

const App = () => {
  return (
    <LayoutShell>
      <Outlet />
    </LayoutShell>
  );
};

export default App;
