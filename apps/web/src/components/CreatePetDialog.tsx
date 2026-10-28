import { useState } from 'react'
import { mintDog, signedInAddress } from '../pets'
import { notifyPetc } from '../stake'
import { useWallet } from '../wallet'

export function CreatePetDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const wallet = useWallet()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  if (!open) return null

  return (
    <div className="wallet-backdrop room-backdrop" onClick={onClose}>
      <div
        className="room-dialog"
        role="dialog"
        aria-labelledby="create-pet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="room-dialog-head">
          <div>
            <h2 id="create-pet-title">Create pet</h2>
            <p>You need a pet to battle. A wallet starts with none.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <img className="create-pet-face" src="/faces/dog.png" alt="" />
        <p className="room-fine">
          Creating a pet mints one dog NFT. The contract sends 100 PETC to this wallet. Every dog starts at HP 100, Power 70, INT 50. One pet per wallet. No price.
        </p>
        {notice ? <p className="lobby-notice">{notice}</p> : null}
        <button
          className="room-lock"
          type="button"
          disabled={busy}
          onClick={() => {
            void (async () => {
              let account = wallet.address ?? signedInAddress()
              if (!account) {
                wallet.setOpen(true)
                const token = await wallet.connectMetaMask()
                if (!token) return
                account = signedInAddress()
              }
              if (!account) return
              setBusy(true)
              setNotice(null)
              try {
                await mintDog(account)
                notifyPetc()
                onCreated()
              } catch (caught) {
                setNotice(caught instanceof Error ? caught.message : 'Could not create the pet.')
              } finally {
                setBusy(false)
              }
            })()
          }}
        >
          Create pet
        </button>
      </div>
    </div>
  )
}
