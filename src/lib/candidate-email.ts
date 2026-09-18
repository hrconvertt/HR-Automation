/**
 * What a recruiting email to a candidate is for. Shared by the draft route and
 * the candidate view's email panel; no imports, so both sides can use it.
 */
export const EMAIL_PURPOSES: { key: string; label: string; brief: string }[] = [
  { key: 'CALL', label: 'Invite to a screening call', brief: 'Invite them to a short screening call and ask for times they are free in the next few days.' },
  { key: 'INTERVIEW', label: 'Invite to an interview', brief: 'Invite them to an interview for the role and ask them to confirm a time. Say it is at our Lahore office unless the note says video.' },
  { key: 'NEXT_STAGE', label: 'Moving forward', brief: 'Tell them they have moved forward in the process and what happens next.' },
  { key: 'TASK', label: 'Send a practical task', brief: 'Send them a short practical task for the role and ask for it back within a few days.' },
  { key: 'REJECT', label: 'Not moving forward', brief: 'Let them know kindly that we will not move forward this time, thank them, and say we will keep their profile for future roles.' },
  { key: 'OFFER_FOLLOW_UP', label: 'Offer follow-up', brief: 'Follow up on the offer we sent and ask if they have any questions before accepting.' },
  { key: 'CUSTOM', label: 'Something else (describe it)', brief: 'Write the email the note describes.' },
]
