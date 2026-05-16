import { AppProvider, useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Terminal from './components/Terminal';
import SettingsModal from './components/SettingsModal';
import './index.css';

function Layout() {
  const { showSettings } = useApp();
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0c10]">
      <Sidebar />
      <Terminal />
      {showSettings && <SettingsModal />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
