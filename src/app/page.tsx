"use client";
import dynamic from 'next/dynamic';

const RifaApp = dynamic(() => import('../components/RifaApp'), {
  ssr: false,
});

export default function Home() {
  return (
    <main>
      <RifaApp />
    </main>
  );
}
