import { TraceProvider } from './context/TraceProvider';
import { useTraceContext } from './context/TraceContext';
import { UploadView } from './components/upload/UploadView';
import { DashboardView } from './components/dashboard/DashboardView';
import { InspectorView } from './components/inspector/InspectorView';

function AppContent() {
  const { state } = useTraceContext();

  return (
    <>
      {state.currentView === 'upload' && <UploadView />}
      {state.currentView === 'dashboard' && <DashboardView />}
      {state.currentView === 'inspector' && <InspectorView />}
      {/* Comparison view will be added in later phase */}
      {state.currentView === 'comparison' && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
          Comparison view coming soon...
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <TraceProvider>
      <AppContent />
    </TraceProvider>
  );
}

export default App;
