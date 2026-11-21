export function studyInvitations(snapshot, t, escape, locale) {
  if (!snapshot.studyInvites?.length) return '';
  return `<section class="card community-card">
    <h2>${t('studyInvites')}</h2>
    ${snapshot.studyInvites.map(invite => `<div class="community-row">
      <div><strong>${escape(invite.name)}</strong><p>${escape(locale === 'en' ? invite.room_en : invite.room)}
        ${invite.private ? `<span class="private-badge">${t('privateBadge')}</span>` : ''}</p></div>
      <div class="community-actions">
        <button class="primary" data-action="answerStudyInvite" data-value="${escape(invite.id)}" data-answer="accept">${t('join')}</button>
        <button class="secondary" data-action="answerStudyInvite" data-value="${escape(invite.id)}" data-answer="reject">${t('reject')}</button>
      </div></div>`).join('')}
  </section>`;
}

export function dailyQuests(quests, t) {
  if (!quests) return '';
  return `<section class="card community-card daily-quests">
    <h2>${t('dailyQuests')}</h2>
    <div class="quest-grid">${quests.goals.map(goal => `<div class="quest">
      <div><strong>${t('todayFocus')} · ${goal.minutes} ${t('minuteUnit')}</strong><span>+ ${goal.coins} ${t('coins')}</span></div>
      <progress aria-label="${t('todayFocus')} ${goal.minutes} ${t('minuteUnit')}" value="${Math.min(quests.minutes, goal.minutes)}" max="${goal.minutes}"></progress>
      <small>${goal.completed ? '✓ ' + t('questCompleted') : `${quests.minutes} / ${goal.minutes} ${t('minuteUnit')}`}</small>
    </div>`).join('')}</div>
  </section>`;
}

export function friendsPanel(snapshot, friendCode, t, escape) {
  const { profile, friends = [] } = snapshot;
  if (!profile.readerCode) return '';
  return `<section class="card community-card">
    <h2>${t('friends')}</h2>
    ${profile.referralCode ? `<p>${t('referralInfo')}</p>` : ''}
    <form class="friend-form" id="friend-form">
      <label class="field">${t('friendId')} <input name="friendCode" value="${escape(friendCode)}" required maxlength="15"
        autocapitalize="characters" autocomplete="off" placeholder="SK-…"></label>
      <button class="primary">${t('addFriend')}</button>
    </form>
    ${friends.length ? friends.map(friend => {
      const id = escape(friend.id);
      return `<div class="community-row"><div><strong>${escape(friend.name)}</strong><p>${escape(friend.code)}
        ${friend.status === 'sent' ? ' · ' + t('friendSent') : friend.status === 'incoming' ? ' · ' + t('friendIncoming') : ''}</p></div>
        <div class="community-actions">${friend.status === 'incoming'
          ? `<button class="primary" data-action="answerFriend" data-value="${id}" data-answer="accept">${t('friendAccept')}</button>
            <button class="secondary" data-action="answerFriend" data-value="${id}" data-answer="reject">${t('reject')}</button>`
          : `${friend.status === 'accepted' && profile.room
            ? `<button class="primary" data-action="inviteFriend" data-value="${id}">${t('studyInvite')}</button>` : ''}
            <button class="secondary" data-action="removeFriend" data-value="${id}">${t(friend.status === 'sent' ? 'friendCancel' : 'friendRemove')}</button>`}
        </div></div>`;
    }).join('') : `<p>${t('noFriends')}</p>`}
  </section>`;
}
