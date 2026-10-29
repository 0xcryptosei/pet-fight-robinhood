import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ConnectDialog } from './components/ConnectDialog'
import { Layout } from './components/Layout'
import { Docs } from './pages/Docs'
import { Home } from './pages/Home'
import { Battle } from './pages/Battle'
import { BattleRooms } from './pages/BattleRooms'
import { Lobby } from './pages/Lobby'
import { Pets } from './pages/Pets'
import { Practice } from './pages/Practice'
import { Shop } from './pages/Shop'
import { WaitingRoom } from './pages/WaitingRoom'
import { WalletProvider } from './wallet'

export function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/docs" element={<Docs />} />
          </Route>
          <Route path="/home" element={<Lobby />} />
          <Route path="/pets" element={<Pets />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/rooms" element={<BattleRooms />} />
          <Route path="/rooms/:roomId" element={<WaitingRoom />} />
          <Route path="/battle/:roomId" element={<Battle />} />
        </Routes>
        <ConnectDialog />
      </WalletProvider>
    </BrowserRouter>
  )
}
