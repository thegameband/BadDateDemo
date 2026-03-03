import './DropALineProfile.css'

const PROFILE_KEYS = [
  { key: 'age', label: 'Age' },
  { key: 'pronouns', label: 'Pronouns' },
  { key: 'occupation', label: 'Occupation' },
  { key: 'hobbies', label: 'Hobbies' },
  { key: 'favoriteFood', label: 'Favorite Food' },
  { key: 'redFlags', label: 'Red Flags' },
]

/**
 * Dating-profile screen between Reels and Pickup Line scene.
 * Props: payload { dater, location }, onContinue(), onBack()
 */
export default function DropALineProfile({ payload, onContinue, onBack }) {
  const dater = payload?.dater
  const profile = dater?.dropALineProfile
  const name = dater?.name ?? 'Your Date'
  const photo = dater?.photo ?? dater?.reactionImages?.neutral

  return (
    <div className="drop-a-line-profile">
      <div className="drop-a-line-profile-inner">
        <button
          type="button"
          className="drop-a-line-profile-back"
          onClick={onBack}
          aria-label="Back"
        >
          ← Back
        </button>

        <div className="drop-a-line-profile-header">
          <div className="drop-a-line-profile-photo-wrap">
            <img
              src={photo}
              alt=""
              className="drop-a-line-profile-photo"
            />
          </div>
          <h2 className="drop-a-line-profile-name">{name}</h2>
        </div>

        <ul className="drop-a-line-profile-details">
          {PROFILE_KEYS.map(({ key, label }) => {
            const value = profile?.[key]
            if (value == null) return null
            return (
              <li key={key} className="drop-a-line-profile-row">
                <span className="drop-a-line-profile-label">{label}:</span>{' '}
                <span className="drop-a-line-profile-value">{value}</span>
              </li>
            )
          })}
        </ul>

        <button
          type="button"
          className="drop-a-line-profile-continue"
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
