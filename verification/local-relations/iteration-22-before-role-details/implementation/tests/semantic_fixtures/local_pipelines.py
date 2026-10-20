"""Unfamiliar helper paths and local failures; statically analyzed only."""
import torch
from torch import nn


class PipelineMosaic(nn.Module):
    def smooth(self, x):
        return torch.tanh(torch.sin(torch.relu(x)))

    def weight(self, y):
        return torch.cos(torch.sigmoid(y))

    def forward(self, x, y):
        a = self.smooth(x)
        b = self.weight(y)
        return a + b


class InterruptedPipeline(nn.Module):
    def smooth(self, x):
        return torch.tanh(torch.sin(torch.relu(x)))

    def weight(self, y):
        return torch.cos(external_unresolved(torch.sigmoid(y)))

    def forward(self, x, y):
        a = self.smooth(x)
        b = self.weight(y)
        return a + b


class EscapingPipeline(nn.Module):
    def smooth(self, x):
        a = torch.relu(x)
        b = torch.sin(a)
        return torch.tanh(b), a

    def weight(self, y):
        return torch.cos(torch.sigmoid(y))

    def forward(self, x, y):
        a, shortcut = self.smooth(x)
        return a + self.weight(y) + shortcut
