import React, { Component } from 'react';
import './App.css';

class App extends Component {
  render() {
    return (
      <div class='container'>
        <div class='row justify-content-center'>
          <div class='col'>
            <div class='typewriter'>
              <h1>Syed Abutalib | Developer</h1>
            </div>
            <section>
              <h1 class='titles'>A Lil Bit About Syed </h1>
              <p>Hey y'all I'm Syed! I am currently a freshman studying CS at the University of Texas at Dallas!.</p>
              <p>Back in high school I did programming competitions and UIL (in Java), as well as other tech-related competitions.</p>
              <p>In Summer 2018 I interned at Kalkomey, where I helped create a fishing app for the State of Nevada! I came back January 2019!</p>
              <p>Would love to find an opportunity somewhere outside of Dallas! Email me for offers!</p>
              <p>If you're still reading, feel free to message me and tell me how to make this website better! I'm open to suggestions!</p>
            </section>
            <section>
              <h1 class='titles'>Skills</h1>
              <p>HTML, JS<br/>Python, Java, Ruby, C++<br/>Rails, React, React Native</p>
              <p>Git, ssh<br/>I'll learn everything if necessary.</p>
            </section>
            <section>
              <h1 class='titles'>Contact</h1>
              <a class='sad' style={{paddingLeft: 0}} href="https://twitter.com/SyedIsSoHot" target="_blank" rel="noopener noreferrer">Twitter</a>
              <a class='sad' href="https://github.com/SyedAbutalib" target="_blank" rel="noopener noreferrer">Github</a>
              <a class='sad' href="https://linkedin.com/in/syed-abutalib" target="_blank" rel="noopener noreferrer">LinkedIn</a>
              <a class='sad' href="https://instagram.com/syedtx" target="_blank" rel="noopener noreferrer">Instagram</a>
              <a class='sad' href="mailto:SyedAbutalib589@gmail.com" target="_blank" rel="noopener noreferrer">Email</a>
            </section>
          </div>
        </div>
      </div>
    );
  }
}

export default App;
