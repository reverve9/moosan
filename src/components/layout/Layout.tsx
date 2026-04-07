import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import BottomNav from './BottomNav'
import FloatingTopButton from './FloatingTopButton'
import { isSubPage } from '@/lib/routing'
import styles from './Layout.module.css'

export default function Layout() {
  const location = useLocation()
  const subPage = isSubPage(location.pathname)

  return (
    <div className={styles.layout}>
      <Header />
      <main className={`${styles.main} ${subPage ? styles.mainNoBottomNav : ''}`}>
        <Outlet />
      </main>
      {!subPage && <BottomNav />}
      <FloatingTopButton />
    </div>
  )
}
