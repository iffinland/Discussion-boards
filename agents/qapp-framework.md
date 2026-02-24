Introduction

Welcome to the create-qortal-app framework.

This documentation will help you on your journey using the default
template of create-qortal-app.

The default template is a React-Mui typescript framework that will
simplify the process of creating Qortal applications.

Why a framework?

• Quicker startup: Starting a new project can be burdensome. The
create-qortal-app framework helps developers jump-start their app logic
in under a minute with just a few simple steps. Building apps that work
seamlessly with Qortal's UI has some unique requirements — this
framework takes care of those complexities for you.

• Simplified QDN integration: QDN (Qortal Data Network) is the backbone
of app functionality on Qortal. Displaying content like JSON, videos,
and images efficiently requires specific logic. This framework handles
most of that for you, so you can focus on building features, not
infrastructure.

• Reusable logic: Many Qortal apps share similar logic. This framework
centralizes that functionality, reducing code duplication and helping
you stay DRY (Don’t Repeat Yourself) across your projects.

• Built for collaboration: Frameworks like this one are designed to be
extended and improved by the community. Other developers can contribute
or create new frameworks, accelerating the app development process for
everyone. The more we collaborate, the more amazing apps we’ll see on
Qortal.

Requirements?

• Node.js: We recommend using Node.js version 22 or higher.

• Qortal Hub: Download the Qortal Hub UI and enable Developer Mode.

• IDE / Code Editor: VS Code is recommended, but other IDEs like
IntelliJ will work as well. • React & TypeScript knowledge: A moderate
understanding of React and TypeScript is helpful.

Starting a new project

Install create-qortal-app and create a new React Qortal project.

Installation

From your terminal install create-qortal-app globally

npm install -g create-qortal-app Create a new project

From your terminal run the following

npx create-qortal-app

The first thing you will need to do is give your app a name. For this
example I'll put the name "my app".

npx create-qortal-app

? Enter the name of your app: my app

Next, we will choose a template. This tutorial is for the
"react-default-template" so we will choose that. Press 'Enter' on your
keyword.

npx create-qortal-app

✔ Enter the name of your app: my app

🔍 Fetching available templates...

? Select a template: (Use arrow keys) ❯ react-default-template

After waiting for about a minute, your project will be ready. If you are
using vscode, the project's workspace should open up automatically. If
not, open your IDE, and open your project's directory.

There is one last thing to do before working on your project.

In the component "AppWrapper.tsx", provide the config with your app's
name. Ideally this will be the App's Qortal name.

During development you might want to provide a different "appName" so
that when your app's in production it isn't filled with test data. In my
case, I've added "Test" at the end of my app's name.

Once in production, do not change the "appName" or else all previous
data meant for your app will not show up.

// AppWrapper.tsx

import { GlobalProvider } from "qapp-core"; import Layout from
'./styles/Layout';

import { publicSalt } from './qapp-config';

export const AppWrapper = () =\> { return (

> \<GlobalProvider config={{
>
> auth: { balanceSetting: {
>
> interval: 180000, onlyOnMount: false,
>
> },
>
> authenticateOnMount: true, },
>
> publicSalt: publicSalt,
>
> appName: "My App Test" // ADD YOUR App's name }}
>
> \>
>
> \<Layout /\> \</GlobalProvider\>

); };

And that's it! You are now ready to start coding.

To start the app in dev mode, run in the terminal at the root of your
project:

npm run dev

<img src="./hposge5k.png"
style="width:6.27083in;height:4.88542in" />In Qortal Hub's dev mode
page, click '+ Server', add the host, port and then enter ''. If you
have one React project running in dev mode, the port is usually 5173.
You will see the port displayed in the terminal after running 'npm run
dev'.

GlobalProvider config

The GlobalProvider is a required component for your app using this
template.

The GlobalProvider is a context provider component that wraps your
entire Qortal-based application and gives your app access to shared
configuration, authentication handling, polling behavior (like balance
fetching), and environment-specific values such as a public salt and app
metadata.

It acts as the root-level setup point for any Qortal-integrated app
using the qapp-core library (included in the setup).

\<GlobalProvider /\> Props

Prop Type Description Default

config.auth.authenticateOnMount when the component mounts.

config.auth.balanceSetting.interval

boolean false

number

Whether to trigger authentication logic

How often (in ms) to poll for balance

updates. 180000

config.auth.balanceSetting.onlyOnMount boolean Only fetch balance once
on mount.false

config.publicSalt string A unique salt used to identify your app’s
public data. -config.appName string The name of your app used for
metadata. -

USER INFO

Authentication

Authentication (auth) — const auth = useAuth()

This hook contains everything related to the currently authenticated
Qortal user. It is accessible globally via:

const auth = useAuth()

Properties Property

auth.address

Description

The user’s Qortal address after authentication.

auth.publicKey The user’s public key.

auth.name The registered Qortal name, if the user has one.
auth.isLoadingUser Whether the user is currently being authenticated.

auth.errorMessageLoadingUser Holds an error message if something goes
wrong during authentication.

auth.authenticateUser() Triggers authentication manually. Example

Let's say you want to to access the user's public key. You can do the
following.

import { useAuth } from "qapp-core";

const auth = useAuth();

const publicKey = auth?.publicKey; console.log(publicKey);
authenticateUser

Even if you have the authenticated process on mount using the
GlobalProvider, the user might decline it. This method allows you to
manually trigger the authentication modal again.

QORT Balance

Balance

Balance — const balanceInfo = useQortBalance()

This hook contains everything related to the user's balance ( if they've
authenticated)

const balanceInfo = useQortBalance() Properties

Property Description

balanceInfo.value The user’s QORT balance value
balanceInfo.isLoadingInforms you if the balance is still in the process
of fetching

balanceInfo.getBalance Returns the user's balance if you wish to fetch
it on the fly. Example

Let's say you want to to access the user's QORT balance. You can do the
following.

import { useQortBalance } from "qapp-core";

const balanceInfo = useQortBalance(); const balance =
balanceInfo?.value; console.log(balance);

You can configure the GlobalProvider, so that the balance gets fetch on
an interval.

LIST

Introduction to list Introduction to lists

This is an guide on how to use the \<ResourceListDisplay /\> component

Use this component to display a list of content retrieved from QDN.

Example of a use case is on Q-Tube's homepage, where a list of video
templates is shown.

Features

• Fetching: Fetches qdn resouces based on the search properties.

• Downloading: Automatically downloads the resource and let's you know
if it failed to download.

• Display: Returns the downloaded resource's raw data so it can be
displayed • Pagination: Automatically handles pagination.

• Cache: Caches the results for a few minutes. No need to worry about
the lag time after a user publishes and for the result to show up.

• Mutation: Ability to update, add and remove items from a list
\<ResourceListDisplay /\> Props

Prop Required Type Description Default

search true QortalSearchParams An object with your search params -

listItemtrue ReactNode A callback function that returns a React
component. The React component is what will be shown as the items in
your list. -

styles ResourceListStyles Custom styles applied to the component. gap
will be in px { gap: 1 }

defaultLoaderParams DefaultLoaderParamsLoading texts if using the
default list loader.. -

loaderItem ReactNode A callback function that returns a React component.
Function that renders a loader for individual list items. -

loaderList ReactNode Function that renders a loader for the full list.
-disableVirtualization boolean If true, renders all items without
virtualization. There is no pagination when using virtualization. false

direction "VERTICAL" \| "HORIZONTAL" The direction in which the list
should render."VERTICAL"

onSeenLastItem function Callback when the last item in the list is seen
(for infinite scroll). -

listName true string Unique name used for caching/search
state.-searchCacheDuration number Time (in ms) to cache search
results.300000 (5 mins)

resourceCacheDuration number Time (in ms) to cache resources like

QDN responses.

disablePagination

1800000 (30 mins)

> boolean If true, disables pagination. false

disableScrollTracker boolean If true, disables scroll tracking. false
entityParams EntityParams When using the build-in identifier builder,
you can pass in the entity and parentId to create the identifier.
Requires that the identifier in the search

param be empty

returnType

\-

"JSON" \| "BASE64" Expected return format of the QDN resource.

Either in JSON or base64 "JSON"

onResults function Callback that fires when results are successfully
fetched and rendered. Returns the list of results in data form. -

searchNewData { interval: number intervalSearch: QortalSearchParams } An
optional param. If populated, it will check for new data based on your
search params. -onNewData function Callback triggered when new data is
fetched. Returns true if there is new data. -

ref React.Ref Ref forwarded to the component. Contains helper functions.
Includes the resetSearch method. Use this when you have new data and
will like to restart the search to show the new data. -

Displaying a list

Let's learn how to display a list by using an example.

Import ResourceListDisplay

import { ResourceListDisplay } from "qapp-core"; Add the required props

import { ResourceListDisplay, QortalSearchParams } from "qapp-core";

// if your search is constant leave it outside the React component const
search: QortalSearchParams \| null = {

> service: "DOCUMENT",
>
> limit: 20, reverse: true,
>
> identifier: "qtube-", };

// inside the React component

> const listItem = useCallback((item: ListItem, index: number) =\> {
> const data = item.data
>
> const qortalMetadata = item.qortalMetadata return (
>
> \<div\>
>
> \<p\>qtube video title: {data.title}\</p\>
>
> \<p\>resource identifier: {qortalMetadata.identifier}\</p\> \</div\>
>
> )
>
> }, \[\]);
>
> \<ResourceListDisplay listName="homepage-videos" search={search}
> listItem={listItem}
>
> /\>

At the minimum you need listName, search, and listItem

listName is up to you what to call it. Each list that you are displaying
should have a unique name. The name controls the handling of lists (
adding, updating, removing and displaying). Let's call ours
"homepage-videos".

search is an object that contains your search parameters. For the list
to work correctly, make sure the values do not change. A change of
search refreshes the list from the beginning. Changing a search param is
okay if you are changing your search and would like to start over.

listItem is a callback function that should return a React component.
The callback function's params will contain your resource data once it's
been download. You can then use those values to do what you want.

Before a resource is downloaded

const loaderItem = useCallback((status) =\> {

> if(status === 'ERROR') return \<ErrorComponent /\> return
> \<ListItemSkeleton /\>;
>
> }, \[\]);
>
> \<ResourceListDisplay listName="homepage-videos" search={search}
> listItem={listItem}
>
> loaderItem={loaderItem} // NEWLY ADDED /\>

While the required params are sufficient for \<ResourceListDisplay/\> ,
your list won't be very pretty.

loaderItem allows you to display your custom loading component. It also
comes with a status of either 'ERROR' or 'LOADING'. ERROR means that the
core was unable to download the resource. At this point it would be nice
to display to your user an error component with a message.

Enabling pagination \<ResourceListDisplay

> listName="homepage-videos" search={search} listItem={listItem}
> loaderItem={loaderItem} styles={{ // NEWLY ADDED
>
> gap: 20, }}
>
> direction="VERTICAL" // NEWLY ADDED disableVirtualization // NEWLY
> ADDED
>
> /\>

Before adding pagination, let's add some spacing between each list item
in the list. We've added the gap field in the styles prop.

Also, we will change the direction of the list by adding
direction="HORIZONTAL"

To enable pagination, we need to add disableVirtualization as a prop.
That's it! To disable pagination, add the prop disablePagination.

loaderItem allows you to display your custom loading component. It also
comes with a status of either 'ERROR' or 'LOADING'. ERROR means that the
core was unable to download the resource. At this point it would be nice
to display to your user an error component with a message.

Fetching new data

const helperListMethodsRef = useRef(null)

const \[hasNewData, setHasNewData\] = useState(false) const onNewData =
useCallback((hasNewData: boolean)=\> {

> setHasNewData(hasNewData) }, \[\])
>
> {hasNewData && ( \<button onClick={()=\> {
>
> helperListMethodsRef.current.resetSearch() }}\>
>
> Show new videos \</button\>
>
> )}
>
> \<ResourceListDisplay listName="homepage-videos" search={search}
> listItem={listItem} loaderItem={loaderItem} styles={{
>
> gap: 20, }}
>
> direction="VERTICAL" disableVirtualization
>
> searchNewData={{ // NEWLY ADDED interval: 10000,
>
> intervalSearch: search }}
>
> onNewData={onNewData} // NEWLY ADDED ref={helperListMethodsRef} //
> NEWLY ADDED
>
> /\>

The searchNewData prop tells the component to fetch new data. The
interval field determines the duration until it checks for new data. It
takes a value in miliseconds. The intervalSearch is the search fields
that it will be querying. In most cases it will be the same as the
search object used above.

The ref prop takes in a ref that will give you access to methods. In the
code block example, you can execute the resetSearch method when there is
new data to be shown in the list.

Non-JSON data \<ResourceListDisplay

> listName="homepage-videos" search={search} listItem={listItem}
> loaderItem={loaderItem} styles={{
>
> gap: 20, }}
>
> direction="VERTICAL" disableVirtualization searchNewData={{
>
> interval: 10000, intervalSearch: search
>
> }} onNewData={onNewData} ref={helperListMethodsRef}
>
> returnType="BASE64" // NEWLY ADDED /\>

The returnType prop allows you to specify the data return type. If you
are dealing with

non-JSON data, choose the "BASE64" as the return type. An example would
be data that is encrypted or data that is simply text.

Adding to a list

After the user has performed a publish, add it to the list. Use the
addNewResources method.

import { useGlobal, objectToBase64 } from "qapp-core";

// inside the React component const {lists} = useGlobal()

const {addNewResources} = lists const data = {} // your data

const dataToBase64 = await objectToBase64(data);

const response = await qortalRequest({ action: "PUBLISH_QDN_RESOURCE",
service: "DOCUMENT",

> identifier: 'an identifier', base64: dataToBase64

});

addNewResources("homepage-videos", \[ {

> qortalMetadata: { service: "DOCUMENT",
>
> identifier: response.identifier, name: response.name,
>
> size: response.size,
>
> created: response.timestamp, },
>
> data: data, },

\]);

The addNewResources requires the list's name and resources to be added
to the list.

Updating a list

After the user has performed a publish that is meant as an update,
update it in the list. Use the updateNewResources method.

import { useGlobal, objectToBase64 } from "qapp-core";

// inside the React component

const {lists} = useGlobal()

const {updateNewResources} = lists const data = {} // your data

const dataToBase64 = await objectToBase64(data);

const response = await qortalRequest({ action: "PUBLISH_QDN_RESOURCE",
service: "DOCUMENT",

> identifier: 'an identifier', base64: dataToBase64

});

updateNewResources("homepage-videos", \[ {

> qortalMetadata: { service: "DOCUMENT",
>
> identifier: response.identifier, name: response.name,
>
> size: response.size,
>
> created: response.timestamp, },
>
> data: data, },

\]);

The updateNewResources requires the list's name and the updated
resources.

Remove from list

To override(similar to a deletion) and remove it from the list, use the
deleteResource method.

import { useGlobal, objectToBase64 } from "qapp-core";

// you can import the QortalMetadata interface from "qapp-core"
interface QortalMetadata {

> size: number; created: number; name: string; identifier: string;
> service: Service;

}

// inside the React component const {lists} = useGlobal() const
{deleteResource} = lists

const qortalMetadata: QortalMetadata = the qortalMetadata

> await deleteResource(\[
>
> qortalMetadata: qortalMetadata \])

\]);

The deleteResource requires the list's name and the resource's
qortalMetadata.

PUBLISHES

Fetching data

In this section we will discuss how to retrive an individual resource's
QDN data.

We will be using the usePublish hook to retrive the data.

There are two ways to retrive data using usePublish

Fetch data on mount

import { usePublish } from "qapp-core";

// inside the React component

const {isLoading, error, resource, hasResource, } = usePublish( 3, //
max fetch retries

> "JSON" // returned type ("JSON" \| "BASE64") {
>
> identifier, name, service
>
> });
>
> if(isLoading) return \<Loader /\>
>
> if(hasResource === false) return \<p\>Resource does not exist\</p\>
>
> if(error) return \<p\>{error}\</p\>

return \<p\>title: {resource?.data?.title}\</p\> Manually fetch data

import { usePublish } from "qapp-core";

// inside the React component

const publishOperations = usePublish(3, "BASE64"); const fetchPublish =
publishOperations.fetchPublish

const handleFetchPublish = async ()=\> {

> const {resource, hasResource, error} = await fetchPublish({
>
> name, identifier, service,
>
> });

}

return \<button onClick={handleFetchPublish}\>fetch data\</button\>
Fetching large sized data

When fetching data that is large such as a video, it is recommended to
use the useResourceStatus hook. This hook returns the status of the
resource. Once it indicates that the data is ready to be used, you can
use it.

import { useResourceStatus } from "qapp-core";

// inside the React component

const {isReady, status, percentLoaded, resourceUrl } =
useResourceStatus( {

> identifier, name, service
>
> });
>
> if(isLoading) return \<Loader /\>
>
> if(status === "FAILED_TO_DOWNLOAD") return \<p\>unable to load
> video\</\>
>
> if(!isReady) return \<Loader percentLoaded={percentLoaded} /\>
>
> return \<video src={resourceUrl} /\>

New or Updated data

After publishing a resource to QDN, use the updatePublish to cache the
new data. This is recommended since there is a few min lag between a
publish and it showing up. This way the user sees the data after they
publish.

import { usePublish, objectToBase64 } from "qapp-core";

// inside the React component

const {updatePublish} = usePublish();

const data = {} // your data

const dataToBase64 = await objectToBase64(data);

const service = "DOCUMENT const identifier = "an identifier" const
base64 = dataToBase64

const response = await qortalRequest({ action: "PUBLISH_QDN_RESOURCE",
service,

> identifier, base64

});

updatePublish( {

> name, service, identifier,
>
> }, data

);

Deleting data

To override(similar to a deletion) the resource, use the deletePublish
method.

import { usePublish } from "qapp-core";

// inside the React component

const {deletePublish} = usePublish();

> await deletePublish({ name,
>
> service, identifier

}) \]);

IDENTIFIERS

Building Identifiers

A resource's location on QDN is based on the resource's publisher
(name), serivice type, and identifier

Carefully crafting the identifier allows an app to query the qdn data
that it needs. It also can act as a way to reference parent-children
relationships.

The buildIdentifier method gives an easy way to build those
relationships. It is used in combination with the lists feature and the
buildSearchPrefix method which is used to construct the appropriate
identifier query.

buildIdentifier

To demonstrate this feature, let's picture the following scenario using
the Friends app.

In the friends app, a user can publish a post. The post is at the top of
the hierchacy so it has no children.

Each post has coments. The parent here is the post.

And let's say each comment has a list of replies. The parent here is the
comment.

So we now have three lists to display to the user, a list of posts, a
list of comments for each post and then a list of replies for each
comment.

Let's create a post

import { useGlobal } from "qapp-core";

// inside the React component

const buildIdentifier =
useGlobal().identifierOperations.buildIdentifier;

const createPost = async ()=\> { const data = {} // your data

> const dataToBase64 = await objectToBase64(data);
>
> const service = "DOCUMENT
>
> const entityType = "post" // Give a name to the type of data this is
> in your app. All posts will need to have the same entity type. do not
> give for example "comments" the entity type "post"

const parentId = null // Since there is no parent to posts in our
example, we will give it a value of null.

> const identifier = await buildIdentifier(entityType, parentId) // Will
> return a unique identifier
>
> const base64 = dataToBase64
>
> const response = await qortalRequest({ action: "PUBLISH_QDN_RESOURCE",
> service,
>
> identifier, base64
>
> });

}

return (

\<button onClick={createPost}\>create post\</button\> )

To create an identifier for a post, we will need to pass
buildSearchPrefix two params.

entityType: a string that represents the kind of resource we will
publish for this app. In this example, all posts will need to have the
same entity type. Do not give for example "comments" the entity type
"post"

parentId: The parentId will be the identifier of the child's parent. For
a post we've determined that it will not have any parent so in this
example we put null.

Creating a comment identifier

import { useGlobal } from "qapp-core";

// inside the React component

const {identifierOperations} = useGlobal(); const {buildIdentifier} =
identifierOperations;

const postId = "e03rJRCU5vxGvF-6fD4hr-MIupmf8DodRIEh-yhbiBoqQSy5tabt"

const createComment = async ()=\> { const data = {} // your data

> const dataToBase64 = await objectToBase64(data);
>
> const service = "DOCUMENT const entityType = "comment"
>
> const parentId = postId
>
> const identifier = await buildIdentifier(entityType, parentId) // Will
> return a unique identifier
>
> const base64 = dataToBase64
>
> const response = await qortalRequest({ action: "PUBLISH_QDN_RESOURCE",
> service,
>
> identifier, base64
>
> });

}

return (

\<button onClick={createComment}\>create comment\</button\> )

We put the entityType as "comment" and the post's identifier as the
parentId.

For the replies, it's the same deal. We put the entityType as "replies"
and the comment's identifier as the parentId.

Searching by identifier

The buildSearchPrefix is used to construct an identifier prefix to
search your resources.

buildSearchPrefix

Keeping with the same example, let's construct the identifier prefix
used to bring back posts. Remember that entityType "post" does not have
a parent.

import { useGlobal } from "qapp-core";

// inside the React component

const {identifierOperations} = useGlobal()

const {buildSearchPrefix} = identifierOperations;

const getPosts = async ()=\> { const service = "DOCUMENT const
entityType = "post"

const parentId = null // Since there is no parent to posts in our
example, we will give it a value of null.

const identifier = await buildSearchPrefix(entityType, parentId) // Will
return a unique identifier

> const response = await qortalRequest({ action: "SEARCH_QDN_RESOURCES",
> limit: 20,
>
> offset: 0, reverse: true service, mode: ALL, prefix: true, identifier

}); }

return (

\<button onClick={getPosts}\>get posts\</button\> )

The entityType we put "post" and for the parentId null since there is no
parent for posts.

Now let's get a post's comments.

parentId: The parentId will be the identifier of the comments' parent-
the post Identifier. The entityType will be "comment"

import { ResourceListDisplay, QortalSearchParams } from "qapp-core";

// if using the entityProp, the identifier in search needs to be an
empty string const search: QortalSearchParams \| null = {

> service: "DOCUMENT", limit: 20,
>
> reverse: true, identifier: "",
>
> };

// inside the React component

> const listItem = useCallback((item: ListItem, index: number) =\> {
> const data = item.data
>
> const qortalMetadata = item.qortalMetadata return (
>
> \<div\>
>
> \<p\>qtube video title: {data.title}\</p\>
>
> \<p\>resource identifier: {qortalMetadata.identifier}\</p\> \</div\>
>
> )
>
> }, \[\]);
>
> \<ResourceListDisplay listName="homepage-videos" search={search}
> listItem={listItem}

entityParams={{ // By adding the entityParam, the identifier prefix will
be constructed for you.

> entityType: 'post', parentId: 'null
>
> }} /\>

Using \<ResourceListDisplay /\> with identifier builder

\*\*See the LISTS section for more information on
ResourceListDisplay\*\*

In the search prop of ResourceLisDisplay, instead of putting the
identifier directly, we can use the entityParams prop to query by our
built identifiers

import { ResourceListDisplay, QortalSearchParams } from "qapp-core";

// if using the entityProp, the identifier in search needs to be an
empty string const search: QortalSearchParams \| null = {

> service: "DOCUMENT", limit: 20,
>
> reverse: true, identifier: "",
>
> };

// inside the React component

> const listItem = useCallback((item: ListItem, index: number) =\> {
> const data = item.data
>
> const qortalMetadata = item.qortalMetadata return (
>
> \<div\>
>
> \<p\>qtube video title: {data.title}\</p\>
>
> \<p\>resource identifier: {qortalMetadata.identifier}\</p\> \</div\>
>
> )
>
> }, \[\]);
>
> \<ResourceListDisplay listName="homepage-videos" search={search}
> listItem={listItem}

entityParams={{ // By adding the entityParam, the identifier prefix will
be constructed for you.

> entityType: 'post', parentId: 'null
>
> }} /\>

UTILS

Data Transformation objectToBase64(obj) async

import { objectToBase64 } from 'qapp-core'

Converts a JavaScript object to a base64-encoded JSON string. Useful for
embedding structured data in QDN or other text-based formats.

Parameters

Name Type Required Description

obj object Yes The object to convert into a base64-encoded JSON string.

Returns

Promise\<string\> – The base64-encoded string of the input object.

Example const data = {

title: "my title" }

const dataToBase = await objectToBase64(data); base64ToObject(base64)

import { base64ToObject } from 'qapp-core'

Decodes a base64-encoded JSON string back into its original JavaScript
object. Internally converts base64 → Uint8Array → Object.

Parameters

Name Type Required Description

base64 string Yes A base64-encoded string representing a JSON object.
Returns

object – The decoded JavaScript object.
