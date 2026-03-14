import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import StockDashboard from "./pages/StockDashboard";
import ForecastPage from "./pages/ForecastPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import ShipTrackerPage from "./pages/ShipTrackerPage";
import SkuManagerPage from "./pages/SkuManagerPage";
import AlertsPage from "./pages/AlertsPage";
import SettingsPage from "./pages/SettingsPage";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={StockDashboard} />
        <Route path="/forecast" component={ForecastPage} />
        <Route path="/purchase-orders" component={PurchaseOrdersPage} />
        <Route path="/ship-tracker" component={ShipTrackerPage} />
        <Route path="/sku-manager" component={SkuManagerPage} />
        <Route path="/alerts" component={AlertsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster richColors theme="dark" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
