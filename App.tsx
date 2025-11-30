import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import { ProjectProvider } from './context/ProjectContext';
import { Sidebar } from './components/layout/Sidebar';
import { Toolbar } from './components/layout/Toolbar';
import { Canvas } from './components/layout/Canvas';
import { ShareModal } from './components/layout/ShareModal';
import './i18n';

export default function App() {
  return (
    <ProjectProvider>
      <ReactFlowProvider>
        <div className="flex h-screen w-screen bg-zinc-950 text-zinc-200 font-sans overflow-hidden">
          <ShareModal />
          <Sidebar />
          <div className="flex-1 relative flex flex-col h-full">
            <Toolbar />
            <Canvas />
          </div>
        </div>
      </ReactFlowProvider>
    </ProjectProvider>
  );
}
