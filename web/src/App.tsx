import { Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/utils";
import Dashboard from "@/pages/Dashboard";
import Targets from "@/pages/Targets";
import Scenarios from "@/pages/Scenarios";
import Playground from "@/pages/Playground";
import Runs from "@/pages/Runs";
import RunDetail from "@/pages/RunDetail";
import Traces from "@/pages/Traces";
import Findings from "@/pages/Findings";
import Policies from "@/pages/Policies";

export default function App() {
  const health = useAsync(() => api.meta().then((m) => m.version).catch(() => undefined));
  return (
    <Routes>
      <Route element={<Layout version={health.data ?? undefined} />}>
        <Route index element={<Dashboard />} />
        <Route path="targets" element={<Targets />} />
        <Route path="scenarios" element={<Scenarios />} />
        <Route path="playground" element={<Playground />} />
        <Route path="runs" element={<Runs />} />
        <Route path="runs/:id" element={<RunDetail />} />
        <Route path="traces" element={<Traces />} />
        <Route path="traces/:traceId" element={<Traces />} />
        <Route path="findings" element={<Findings />} />
        <Route path="policies" element={<Policies />} />
        <Route path="*" element={<div className="py-20 text-center text-muted">Page not found.</div>} />
      </Route>
    </Routes>
  );
}
