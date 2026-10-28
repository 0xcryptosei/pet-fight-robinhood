import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Footer } from './Footer'
import { Header } from './Header'

export function Layout() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0)
      return
    }
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [pathname, hash])

  return (
    <>
      <Header />
      <main id={pathname === '/' ? 'top' : undefined} className={pathname === '/docs' ? 'docs' : undefined}>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
