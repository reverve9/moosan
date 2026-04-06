import Header from '@/components/layout/Header'
import BottomNav from '@/components/layout/BottomNav'
import FloatingTopButton from '@/components/layout/FloatingTopButton'
import Footer from '@/components/layout/Footer'
import HeroSection from './sections/HeroSection'
import styles from './HomePage.module.css'

export default function HomePage() {
  return (
    <div className={styles.home}>
      <Header />
      <main>
        <HeroSection />
      </main>
      <Footer />
      <BottomNav />
      <FloatingTopButton />
    </div>
  )
}
