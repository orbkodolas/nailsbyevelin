import type { PaymentMethod } from '../lib/api'

type Props = { methods: PaymentMethod[]; value: string; onChange: (id: string) => void; name: string }

// Csak akkor jelenik meg, ha több fizetési mód közül lehet választani
export function PaymentPicker({ methods, value, onChange, name }: Props) {
  if (methods.length < 2) return null
  return (
    <fieldset className="choice-group">
      <legend>Fizetés módja</legend>
      {methods.map((method) => (
        <label key={method.id} className="choice">
          <input type="radio" name={name} value={method.id} checked={value === method.id} onChange={() => onChange(method.id)} />
          <span>{method.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
