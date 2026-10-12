import AxeBuilder from "@axe-core/playwright";
import { expect, mockMarketplace, test } from "./fixture";
import { menu } from "../e2e/menu";
import { generateKeyMaterial, unwrapPrivateKeyBytes, wrapPrivateKey } from "../../src/crypto";

test("star favourites survive refresh, filter listings, and work with the keyboard",async({page})=>{
  await page.goto('/');
  const star=page.getByRole('button',{name:'Favourite Logitech G Pro X Superlight',exact:true});
  await star.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'Unfavourite Logitech G Pro X Superlight',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();await page.getByRole('button',{name:'★ Favourites',exact:true}).click();
  await expect(page.locator('.card')).toHaveCount(1);
  await page.getByRole('button',{name:'Unfavourite Logitech G Pro X Superlight',exact:true}).click();await expect(page.locator('.card')).toHaveCount(0);
});

test("guest personalization updates the hero, preserves listing photos and resets",async({page})=>{
  await page.goto('/');const photo=await page.locator('.card').filter({hasText:'Logitech G Pro X Superlight'}).locator('img').getAttribute('src');
  await page.getByRole('button',{name:'Personalize',exact:true}).click();const picker=page.getByRole('dialog',{name:'Personalize GearDrop'});
  await picker.getByRole('button',{name:/Creator setups/}).click();await picker.getByLabel('Gaming platform').selectOption('pc');await picker.getByRole('button',{name:'Save preferences'}).click();
  await expect(page.locator('h1')).toHaveText('Make your setup stream-ready.');
  await expect(page.locator('.card').first()).toContainText(/Mics|Headsets/);
  await expect(page.locator('.card').filter({hasText:'Logitech G Pro X Superlight'}).locator('img')).toHaveAttribute('src',photo!);
  await page.reload();await expect(page.locator('h1')).toHaveText('Make your setup stream-ready.');
  await page.getByRole('button',{name:'Reset to default',exact:true}).click();await expect(page.locator('h1')).toContainText('Your next loadout');
});

test("seller edits price, structured specs and availability; outsiders have no edit control",async({page})=>{
  await mockMarketplace(page,true);await page.goto('/');
  await page.getByRole('button',{name:/^View Seller's mouse,/}).click();
  await page.getByRole('button',{name:'Edit listing',exact:true}).click();const edit=page.getByRole('dialog',{name:'Edit listing'});
  await edit.getByLabel('Price (USD)').fill('42.50');await edit.getByLabel('Availability').selectOption('Sold');await edit.getByLabel('Value 1', {exact:true}).fill('55 g');
  await edit.getByRole('button',{name:'Save listing'}).click();await expect(edit).toHaveCount(0);
  const detail=page.getByRole('dialog',{name:"Seller's mouse"});await expect(detail).toContainText('42.5');await expect(detail).toContainText('55 g');await expect(detail).toContainText('Sold');
  await detail.getByRole('button',{name:'Close',exact:true}).click();await page.reload();
  await expect(page.getByRole('button',{name:/^View Seller's mouse,/})).toContainText('Sold');
  await page.locator('.card').filter({hasText:"Other seller's mouse"}).click();await expect(page.getByRole('button',{name:'Edit listing',exact:true})).toHaveCount(0);
});

test("stacked profile modal closes alone and keeps the underlying listing scroll lock",async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/^View Seller's mouse,/}).click();
  await page.getByRole('button',{name:/Sold by seller/}).click();const profile=page.getByRole('dialog',{name:/seller.s profile/});
  await expect(profile).toContainText('Member since');await expect(profile).toContainText('Selling now');
  await page.keyboard.press('Escape');await expect(profile).toHaveCount(0);await expect(page.getByRole('dialog',{name:"Seller's mouse"})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).toBe('');
});

test("account favourites/preferences stay separate from guest choices and Nyx receives enums",async({page})=>{
  await mockMarketplace(page,true);await page.goto('/');
  await page.getByRole('button',{name:"Favourite Seller's mouse",exact:true}).click();await page.reload();await expect(page.getByRole('button',{name:"Unfavourite Seller's mouse",exact:true})).toHaveAttribute('aria-pressed','true');
  await menu(page,'Settings');const settings=page.getByRole('dialog',{name:'Account settings'});
  await settings.getByLabel('Gamer persona').selectOption('competitive');await settings.getByLabel('Gaming platform').selectOption('pc');await settings.getByRole('button',{name:'Save preferences'}).click();await expect(settings.getByRole('status')).toContainText('saved');await settings.getByRole('button',{name:'Close',exact:true}).click();
  await page.reload();await expect(page.locator('h1')).toHaveText('Gear up for your next win.');
  await page.locator('nav').getByRole('link',{name:'Ask Nyx',exact:true}).click();
  await expect(page.locator('#nyx').getByText('15 of 15 questions left today')).toBeVisible();
  const request=page.waitForRequest(r=>r.url().includes('/functions/v1/nyx'));
  await page.getByLabel('Ask Nyx anything').fill('Which mouse should I choose?');await page.locator('#nyx').getByRole('button',{name:'Ask Nyx →',exact:true}).click();
  expect((await request).postDataJSON()).toMatchObject({persona:'competitive',platform:'pc'});
  await expect(page.locator('#nyx').getByText('14 of 15 questions left today')).toBeVisible();
});

test("recovery requests use a real email and reset validates passwords",async({page})=>{
  await page.goto('/');await menu(page,'Sign in / Sign up');await page.getByRole('button',{name:'Forgot password?'}).click();const recover=page.getByRole('dialog',{name:'Recover account'});
  await recover.getByLabel('Account email').fill('user@nyx.local');await recover.getByRole('button',{name:'Send recovery link'}).click();await expect(recover.getByRole('alert')).toContainText('real email');
  await recover.getByLabel('Account email').fill('seller@example.com');await recover.getByRole('button',{name:'Send recovery link'}).click();await expect(recover.getByRole('status')).toContainText('If an eligible account');
  await mockMarketplace(page,true);await page.goto('/#reset-password');await page.reload();const reset=page.getByRole('dialog',{name:'Reset password'});
  await reset.getByLabel('New password',{exact:true}).fill('short');await reset.getByLabel('Confirm new password').fill('short');await reset.getByRole('button',{name:'Update password'}).click();await expect(reset.getByRole('alert')).toContainText('12 characters');
  await reset.getByLabel('New password',{exact:true}).fill('NewPassword123!');await reset.getByLabel('Confirm new password').fill('NewPassword123!');await reset.getByRole('button',{name:'Update password'}).click();await expect(reset).toHaveCount(0);await expect(page.locator('.toast')).toContainText('Password updated');
});

test("new controls pass accessibility checks in both themes and on mobile",async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);const result=await new AxeBuilder({page}).analyze();expect(result.violations).toEqual([]);}
  await page.getByRole('button',{name:'Personalize',exact:true}).click();const result=await new AxeBuilder({page}).analyze();expect(result.violations).toEqual([]);await page.keyboard.press('Escape');
  await page.setViewportSize({width:375,height:812});await page.getByRole('button',{name:'Personalize',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({path:'test-results/personalize-mobile.png',fullPage:false});
});

test("failed seller updates and account saves show errors without changing listings",async({page})=>{
  await mockMarketplace(page,true);
  await page.route('**/rest/v1/listings**',async route=>{if(route.request().method()==='PATCH')await route.fulfill({status:403,json:{message:'Denied'}});else await route.fallback();});
  await page.goto('/');await page.getByRole('button',{name:/^View Seller's mouse,/}).click();await page.getByRole('button',{name:'Edit listing',exact:true}).click();const edit=page.getByRole('dialog',{name:'Edit listing'});
  await edit.getByLabel('Price (USD)').fill('25');await edit.getByRole('button',{name:'Save listing'}).click();await expect(edit.getByRole('alert')).toContainText('Could not update');await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:"Seller's mouse"})).toContainText('$ 50');await page.keyboard.press('Escape');
  await page.route('**/rest/v1/favorites**',async route=>{if(route.request().method()==='POST')await route.fulfill({status:500,json:{message:'Missing table'}});else await route.fallback();});
  await page.getByRole('button',{name:"Favourite Seller's mouse",exact:true}).click();await expect(page.locator('.toast')).toContainText('Could not save');await expect(page.getByRole('button',{name:"Favourite Seller's mouse",exact:true})).toHaveAttribute('aria-pressed','false');
});

test("password recovery preserves the old backup when the previous password is forgotten",async({page})=>{
  const material=await generateKeyMaterial(),backup=await wrapPrivateKey(material.pkcs8,'OldPassword123!');
  await mockMarketplace(page,true,backup);
  let passwordWrites=0,backupWrites=0;
  page.on('request',r=>{if(r.url().includes('/auth/v1/user')&&r.method()==='PUT')passwordWrites++;if(r.url().includes('/rest/v1/key_backups')&&r.method()==='POST')backupWrites++;});
  await page.goto('/#reset-password');const reset=page.getByRole('dialog',{name:'Reset password'});
  await reset.getByLabel('New password',{exact:true}).fill('NewPassword123!');await reset.getByLabel('Confirm new password').fill('NewPassword123!');await reset.getByRole('button',{name:'Update password'}).click();
  await expect(reset.getByRole('alert')).toContainText('Acknowledge');expect(passwordWrites).toBe(0);
  await reset.getByRole('checkbox').check();await reset.getByRole('button',{name:'Update password'}).click();await expect(reset).toHaveCount(0);
  expect(passwordWrites).toBe(1);expect(backupWrites).toBe(0);
});

test("recovery retries a failed chat-backup migration without changing the password twice",async({page})=>{
  const material=await generateKeyMaterial(),backup=await wrapPrivateKey(material.pkcs8,'OldPassword123!');
  await mockMarketplace(page,true,backup);let deny=true,passwordWrites=0,newBackup:any=null;
  page.on('request',r=>{if(r.url().includes('/auth/v1/user')&&r.method()==='PUT')passwordWrites++;if(r.url().includes('/rest/v1/key_backups')&&r.method()==='POST')newBackup=r.postDataJSON();});
  await page.route('**/rest/v1/key_backups**',async route=>{if(deny&&route.request().method()==='POST')await route.fulfill({status:500,json:{message:'Retry'}});else await route.fallback();});
  await page.goto('/#reset-password');const reset=page.getByRole('dialog',{name:'Reset password'});
  await reset.getByLabel('New password',{exact:true}).fill('NewPassword123!');await reset.getByLabel('Confirm new password').fill('NewPassword123!');await reset.getByLabel(/^Previous password/).fill('OldPassword123!');await reset.getByRole('button',{name:'Update password'}).click();
  await expect(reset.getByRole('alert')).toContainText('password changed');deny=false;await reset.getByRole('button',{name:'Retry chat backup'}).click();await expect(reset).toHaveCount(0);
  expect(passwordWrites).toBe(1);expect(await unwrapPrivateKeyBytes(newBackup,'NewPassword123!')).toEqual(material.pkcs8);
});

test("chat opens the other participant's public profile and restores focus on close",async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await mockMarketplace(page,true);await page.goto('/');await menu(page,'Messages');await page.locator('.inbox-list button').first().click();
  await page.getByRole('button',{name:'View other’s profile',exact:true}).click();const profile=page.getByRole('dialog',{name:'other’s profile',exact:true});
  await expect(profile).toContainText('Member since');const result=await new AxeBuilder({page}).include('.profile').analyze();expect(result.violations).toEqual([]);
  await page.keyboard.press('Escape');await expect(profile).toHaveCount(0);await expect(page.getByRole('button',{name:'View other’s profile',exact:true})).toBeFocused();
});

test("My profile owns private account details and ratings; Settings stays focused",async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await mockMarketplace(page,true);await page.goto('/');
  await expect(page.locator('#browse')).not.toContainText('Guest favourites are saved on this browser');
  await menu(page,'My profile');const profile=page.getByRole('dialog',{name:'My profile',exact:true});
  await expect(profile.locator('.settings-list')).toContainText('seller');await expect(profile.locator('.settings-list')).toContainText('seller@example.com');await expect(profile).toContainText('Your ratings');await expect(profile.getByRole('button',{name:'Change email',exact:true})).toBeVisible();
  const result=await new AxeBuilder({page}).include('[role="dialog"]').analyze();expect(result.violations).toEqual([]);
  await profile.getByRole('button',{name:'Change email',exact:true}).click();await profile.getByLabel('New email').fill('not-an-email');await profile.getByRole('button',{name:'Send confirmation link'}).click();await expect(profile.getByRole('alert')).toHaveText('Enter a valid email address.');
  await profile.getByRole('button',{name:'Close',exact:true}).click();await menu(page,'Settings');const settings=page.getByRole('dialog',{name:'Account settings'});
  await expect(settings).not.toContainText('seller@example.com');await expect(settings).not.toContainText('Your ratings');await expect(settings).not.toContainText('nyx_feedback');await expect(settings.getByRole('button',{name:'Change password',exact:true})).toBeVisible();
  await settings.getByRole('button',{name:'Reset password by email'}).click();await expect(page.getByRole('dialog',{name:'Recover account'})).toBeVisible();await page.keyboard.press('Escape');await expect(settings).toBeVisible();
  await settings.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:/^View Other seller's mouse,/}).click();await page.getByRole('button',{name:/Sold by other/}).click();await expect(page.getByRole('dialog',{name:'other’s profile',exact:true})).not.toContainText('@');
});

test("Settings password changes verify the current password and preserve the chat backup",async({page})=>{
  const material=await generateKeyMaterial(),backup=await wrapPrivateKey(material.pkcs8,'OldPassword123!');
  await mockMarketplace(page,true,backup);let passwordWrites=0,newBackup:any=null;
  page.on('request',r=>{if(r.url().includes('/auth/v1/user')&&r.method()==='PUT')passwordWrites++;if(r.url().includes('/rest/v1/key_backups')&&r.method()==='POST')newBackup=r.postDataJSON();});
  await page.route('**/auth/v1/token**',async route=>{if(route.request().postDataJSON().password!=='OldPassword123!')await route.fulfill({status:400,json:{error:'invalid_grant',error_description:'Invalid login credentials'}});else await route.fallback();});
  await page.goto('/');await menu(page,'Settings');await page.getByRole('button',{name:'Change password',exact:true}).click();const form=page.getByRole('dialog',{name:'Change password',exact:true});
  await form.getByLabel(/^Current password/).fill('WrongPassword123!');await form.getByLabel('New password',{exact:true}).fill('NewPassword123!');await form.getByLabel('Confirm new password').fill('NewPassword123!');await form.getByRole('button',{name:'Update password'}).click();await expect(form.getByRole('alert')).toHaveText('Incorrect current password.');expect(passwordWrites).toBe(0);
  await form.getByLabel(/^Current password/).fill('OldPassword123!');await form.getByRole('button',{name:'Update password'}).click();await expect(form).toHaveCount(0);expect(passwordWrites).toBe(1);expect(await unwrapPrivateKeyBytes(newBackup,'NewPassword123!')).toEqual(material.pkcs8);await expect(page.getByRole('dialog',{name:'Account settings'})).toHaveCount(0);
});

test("favourites Q&A explains the star action",async({page})=>{
  await page.goto('/#privacy-safety-questions');const question=page.getByText('How do I favourite listings?',{exact:true});await question.click();await expect(page.getByText('Simply click the star on the listing.',{exact:true})).toBeVisible();
});
