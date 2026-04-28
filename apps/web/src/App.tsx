import { HeroSection } from './components/home/HeroSection';
import { ActivityCards } from './components/home/ActivityCards';
import { HowItWorks } from './components/home/HowItWorks';
import { SafetySection } from './components/home/SafetySection';
import { RankSystem } from './components/home/RankSystem';
import { GroupEvents } from './components/home/GroupEvents';
import { FinalCTA } from './components/home/FinalCTA';

export default function App() {
  return (
    <main className="min-h-screen bg-white">
      <HeroSection />
      <ActivityCards />
      <HowItWorks />
      <SafetySection />
      <RankSystem />
      <GroupEvents />
      <FinalCTA />
    </main>
  );
}
