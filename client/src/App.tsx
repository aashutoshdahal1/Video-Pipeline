import { Routes, Route, Navigate } from 'react-router-dom';
import ProjectList from './pages/ProjectList';
import NewProject from './pages/NewProject';
import StepVoice from './pages/StepVoice';
import StepTranscript from './pages/StepTranscript';
import StepPrompts from './pages/StepPrompts';
import StepImages from './pages/StepImages';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectList />} />
      <Route path="/new" element={<NewProject />} />
      <Route path="/job/:id/voice" element={<StepVoice />} />
      <Route path="/job/:id/transcript" element={<StepTranscript />} />
      <Route path="/job/:id/prompts" element={<StepPrompts />} />
      <Route path="/job/:id/images" element={<StepImages />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
