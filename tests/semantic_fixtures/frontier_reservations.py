"""Static-only budget competition between a summary and unrelated details."""
import torch
from torch import nn


class FrontierMosaic(nn.Module):
    def compact(self, x):
        return torch.tanh(torch.cos(torch.sin(torch.relu(x))))

    def reused(self, x):
        value = torch.sigmoid(x)
        return torch.sin(value) - torch.cos(value)

    def forward(self, x):
        return torch.tanh(self.reused(self.compact(x)))


class UnknownMosaic(nn.Module):
    def compact(self, x):
        return torch.cos(torch.sin(torch.relu(x)))

    def uncertain(self, x):
        return external_unresolved(x)

    def forward(self, x):
        value = self.compact(x)
        return torch.tanh(self.uncertain(value))


class NestedMosaic(nn.Module):
    def inner(self, x):
        return torch.sin(torch.relu(x))

    def compact(self, x):
        return torch.cos(self.inner(x))

    def reused(self, x):
        value = torch.sigmoid(x)
        return torch.sin(value) - torch.cos(value)

    def forward(self, x):
        return torch.tanh(self.reused(self.compact(x)))
