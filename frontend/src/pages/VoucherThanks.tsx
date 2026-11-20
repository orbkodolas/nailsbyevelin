import { PageShell } from '../components/PageShell'

export function VoucherThanks() {
  return (
    <PageShell>
      <div className="status-card">
        <p className="eyebrow"><span className="eyebrow-line" />Ajándékutalvány</p>
        <h1>Köszönöm a <em>rendelést!</em></h1>
        <p>A fizetés beérkezése után az utalvány kódját e-mailben elküldöm. Ha pár percen belül nem érkezik meg, nézd meg a spam mappát is.</p>
        <a className="btn btn-primary" href="#/"><span>Vissza a főoldalra</span></a>
      </div>
    </PageShell>
  )
}
