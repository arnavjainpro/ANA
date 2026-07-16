import Nav from './components/Nav';
import Hero from './components/Hero';
import Statement from './components/Statement';
import Features from './components/Features';
import BlogCarousel from './components/BlogCarousel';
import Footer from './components/Footer';

export default function App() {
  return (
    <div className="min-h-screen bg-paper-cream font-sans text-ink antialiased">
      <Nav />
      <main>
        <Hero />
        <Statement />
        <Features />
        <BlogCarousel />
      </main>
      <Footer />
    </div>
  );
}
