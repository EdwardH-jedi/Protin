import { useState } from 'react';
import { Hero } from './components/Hero';
import { ActivityMatching } from './components/ActivityMatching';
import { HowItWorks } from './components/HowItWorks';
import { TrustSafety } from './components/TrustSafety';
import { RankingSystem } from './components/RankingSystem';
import { GroupEvents } from './components/GroupEvents';
import { FinalCTA } from './components/FinalCTA';

export default function App() {
  const [email, setEmail] = useState('');

  const handleJoinWaitlist = (userEmail: string) => {
    setEmail(userEmail);
    console.log('Waitlist signup:', userEmail);
  };

  return (
    <div className="min-h-screen bg-white">
      <Hero onJoinWaitlist={handleJoinWaitlist} />
      <ActivityMatching />
      <HowItWorks />
      <TrustSafety />
      <RankingSystem />
      <GroupEvents />
      <FinalCTA onJoinWaitlist={handleJoinWaitlist} />
    </div>
  );
}
